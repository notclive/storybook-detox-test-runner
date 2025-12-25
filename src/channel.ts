import { device } from 'detox'
import events, {
  CHANNEL_CREATED,
  SET_CURRENT_STORY,
  STORY_RENDERED,
  STORY_THREW_EXCEPTION,
  STORY_UNCHANGED,
} from 'storybook/internal/core-events'
import { WebSocket, WebSocketServer } from 'ws'

const PORT = Number(process.env.STORYBOOK_WS_PORT || 7007)
const WS_OPEN = 1

const DEBUG = process.env.STORYBOOK_CHANNEL_DEBUG === '1'
const log = (...args: unknown[]) => {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[storybook-detox-channel]', ...args)
  }
}
interface Channel {
  server?: WebSocketServer
  client?: {
    identifier?: string
    socket: WebSocket
    connectedAt?: number
  } | null
}

type PendingEntry = { resolve: () => void; reject: (err: Error) => void }

type InternalChannel = Channel & {
  pending?: Map<string, PendingEntry>
  routePromise?: Promise<void> | null
  serverPromise?: Promise<void> | null
}

type Message = {
  type: events
  from?: string
  args?: any[]
}

// Cannot use module scope variable, require during test execution returns different instance.
// Probably because of transformer.
function getChannel(): InternalChannel {
  const g = globalThis as any
  g.channel = g.channel ?? {}

  const ch: InternalChannel = g.channel

  ch.pending = ch.pending ?? new Map<string, PendingEntry>()
  ch.routePromise = ch.routePromise ?? null
  ch.serverPromise = ch.serverPromise ?? null

  return ch
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function withTimeout<T>(label: string, promise: Promise<T>, timeoutInMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), timeoutInMs)

    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

function safeJsonParse(buffer: Buffer): Message | null {
  try {
    return JSON.parse(buffer.toString('utf-8')) as Message
  } catch {
    return null
  }
}

// Supports both string storyId and object { storyId: string } payload formats
// to maintain backward compatibility with different Storybook versions.
function extractStoryIdFromMessage(message: Message): string | null {
  const a0 = message?.args?.[0]

  if (typeof a0 === 'string') {
    return a0
  }

  if (a0 && typeof a0 === 'object' && typeof (a0 as any).storyId === 'string') {
    return (a0 as any).storyId
  }

  return null
}

// Centralized error propagation: when socket closes/errors or story throws,
// all pending changeStory requests must fail immediately to prevent hanging tests.
function rejectAllPending(err: Error) {
  const ch = getChannel()
  const pending = ch.pending

  if (!pending || pending.size === 0) return

  pending.forEach((p) => {
    try {
      p.reject(err)
    } catch {
      // ignore
    }
  })

  pending.clear()
}

function attachClientSocket(socket: WebSocket) {
  const ch = getChannel()
  const prev = ch.client?.socket

  // When app restarts during tests, a new socket connects.
  // Close the old one to prevent stale sockets and listener accumulation.
  if (prev && prev !== socket) {
    try {
      prev.close()
    } catch {
      // ignore
    }
  }

  ch.client = {
    socket,
    identifier: ch.client?.identifier,
    connectedAt: Date.now(),
  }

  const anySocket = socket as WebSocket & { __sbDetoxHandlersAttached?: boolean }

  // Single message handler per socket: prevents listener leaks that caused
  // MaxListenersExceededWarning when each changeStory() added its own handler.
  if (anySocket.__sbDetoxHandlersAttached) {
    return
  }

  anySocket.__sbDetoxHandlersAttached = true

  // All pending requests stored in Map<storyId, PendingEntry>.
  // When STORY_RENDERED/STORY_UNCHANGED arrives, corresponding pending is resolved.
  // This replaces per-call socket.on('message') pattern that leaked listeners.
  socket.on('message', (buffer: Buffer) => {
    const message = safeJsonParse(buffer)

    if (!message) {
      return
    }

    if (message.type === CHANNEL_CREATED) {
      const from = message.from

      if (typeof from === 'string') {
        const cur = getChannel().client

        if (cur?.socket === socket) {
          cur.identifier = from
        }
      }

      log('CHANNEL_CREATED from:', from)
      return
    }

    // Story error during render: fail all pending requests immediately
    // so tests don't hang waiting for render that will never complete.
    if (message.type === STORY_THREW_EXCEPTION) {
      const storyError = message.args?.[0]
      const err = new Error('Story threw exception during render: ' + JSON.stringify(storyError))

      rejectAllPending(err)
      return
    }

    // Story rendered successfully: resolve only the matching pending request.
    if (message.type === STORY_RENDERED || message.type === STORY_UNCHANGED) {
      const renderedId = extractStoryIdFromMessage(message)

      if (!renderedId) {
        return
      }

      const pending = getChannel().pending
      const p = pending?.get(renderedId)

      if (p) {
        pending!.delete(renderedId)

        try {
          p.resolve()
        } catch {
          // ignore
        }
      }
    }
  })

  // Socket close/error: fail all pending requests immediately.
  // Without this, tests would hang until timeout when device disconnects.
  socket.on('close', () => {
    log('client socket closed')
    rejectAllPending(new Error('Storybook device socket closed'))
  })

  socket.on('error', (e: any) => {
    log('client socket error:', e?.message ?? e)
    rejectAllPending(new Error('Storybook device socket error: ' + (e?.message ?? String(e))))
  })
}

// Idempotent server start: multiple spec files call prepareChannel() in beforeAll,
// but we need exactly one WebSocket server per Jest process to avoid port conflicts.
async function ensureServerStarted() {
  const ch = getChannel()

  if (ch.serverPromise) {
    return ch.serverPromise
  }

  ch.serverPromise = (async () => {
    if (ch.server) return

    const server = new WebSocketServer({ port: PORT })
    ch.server = server

    server.on('connection', (socket: WebSocket) => {
      log('client connected')
      attachClientSocket(socket)
    })

    server.on('error', (e: any) => {
      log('server error:', e?.message ?? e)
    })

    log('server started on port', PORT)
  })()

  return ch.serverPromise
}

export async function prepareChannel() {
  await ensureServerStarted()
}

// Idempotent reverse port: repeated reverseTcpPort calls can degrade/stall adb,
// causing "The app seems to be idle" failures. One reverse per Jest process is enough.
export async function routeFromDeviceToServer() {
  const ch = getChannel()

  if (ch.routePromise) {
    return ch.routePromise
  }

  ch.routePromise = (async () => {
    try {
      await device.reverseTcpPort(PORT)
      log('reverseTcpPort ok:', PORT)
    } catch (e: any) {
      // Allow retry on next call if reverse failed (e.g., adb restart needed).
      ch.routePromise = null
      log('reverseTcpPort failed:', e?.message ?? e)
      throw e
    }
  })()

  return ch.routePromise
}

// Complete cleanup: reject pending requests, close client socket, close server.
// Resets all promises so next test run starts fresh.
export async function closeChannel() {
  const ch = getChannel()

  try {
    rejectAllPending(new Error('Channel closed'))
  } catch {
    // ignore
  }

  ch.routePromise = null

  try {
    ch.client?.socket?.close?.()
  } catch {
    // ignore
  }

  ch.client = null

  if (!ch.server) {
    return
  }

  await new Promise<void>((resolve) => ch.server?.close(() => resolve()))
  ch.server = undefined
  ch.serverPromise = null
}

async function waitForOpenClientSocket(timeoutMs: number): Promise<WebSocket> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const socket = getChannel().client?.socket

    if (socket && (socket as any).readyState === WS_OPEN) {
      return socket
    }

    await sleep(100)
  }

  throw new Error('Storybook running on device should have connected by now')
}

// Creates a pending promise for storyId. If duplicate request for same storyId exists
// (should not happen normally), reject the old one to prevent zombie promises.
function createPendingRenderPromise(storyId: string): Promise<void> {
  const ch = getChannel()
  const pending = ch.pending!
  const existing = pending.get(storyId)

  if (existing) {
    try {
      existing.reject(new Error(`Superseded pending changeStory("${storyId}")`))
    } catch {
      // ignore
    }

    pending.delete(storyId)
  }

  return new Promise<void>((resolve, reject) => {
    pending.set(storyId, { resolve, reject })
  })
}

export async function changeStory(storyId: string) {
  await ensureServerStarted()
  await routeFromDeviceToServer()

  const connectTimeoutMs = Number(process.env.STORYBOOK_WS_CONNECT_TIMEOUT_MS || 60_000)
  const changeTimeoutMs = Number(process.env.STORYBOOK_CHANGE_STORY_TIMEOUT_MS || 20_000)
  const socket = await waitForOpenClientSocket(connectTimeoutMs)

  // Create pending BEFORE send to avoid race condition
  // if STORY_RENDERED arrives before pending is registered.
  const waitForRender = createPendingRenderPromise(storyId)

  try {
    socket.send(
      JSON.stringify({
        type: SET_CURRENT_STORY,
        args: [{ storyId }],
      }),
    )
  } catch (e: any) {
    // Clean up pending if send failed to prevent dangling promise.
    try {
      const ch = getChannel()
      const p = ch.pending?.get(storyId)

      if (p) {
        ch.pending?.delete(storyId)
        p.reject(new Error('Failed to send SET_CURRENT_STORY: ' + (e?.message ?? String(e))))
      }
    } catch {
      // ignore
    }

    throw e
  }

  try {
    await withTimeout(`App timed out changing stories: ${storyId}`, waitForRender, changeTimeoutMs)
  } finally {
    // Cleanup pending on timeout or success to prevent memory leaks.
    const pending = getChannel().pending

    if (pending?.has(storyId)) {
      pending.delete(storyId)
    }
  }
}
