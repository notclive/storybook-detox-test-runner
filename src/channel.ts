import { device } from 'detox'
import events, {
  CHANNEL_CREATED,
  SET_CURRENT_STORY,
  STORY_RENDERED,
  STORY_THREW_EXCEPTION,
  STORY_UNCHANGED,
} from 'storybook/internal/core-events'
import { WebSocket, WebSocketServer } from 'ws'

const WS_OPEN = 1
const PORT = Number(process.env.STORYBOOK_WS_PORT || 7007)
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
  pendingStory: PendingStoryRender | null
  routePromise: Promise<void> | null
  serverPromise: Promise<void> | null
}

type PendingStoryRender = {
  storyId: string
  resolve: () => void
  reject: (err: Error) => void
}

type Message = {
  type: events
  from?: string
  args?: any[]
}

// Cannot use module scope variable, require during test execution returns different instance.
// Probably because of transformer.
function getChannel(): Channel {
  globalThis.channel = globalThis.channel ?? {
    pendingStory: null,
    routePromise: null,
    serverPromise: null,
  }

  return globalThis.channel
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function withTimeout<T>(label: string, promise: Promise<T>, timeoutInMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(label)), timeoutInMs)

    promise.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeoutId)
        reject(error)
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
  const firstArg = message?.args?.[0]

  if (typeof firstArg === 'string') {
    return firstArg
  }

  if (firstArg && typeof firstArg === 'object' && typeof firstArg.storyId === 'string') {
    return firstArg.storyId
  }

  return null
}

function rejectPendingStory(error: Error) {
  const channel = getChannel()
  const pending = channel.pendingStory

  if (!pending) {
    return
  }

  channel.pendingStory = null

  try {
    pending.reject(error)
  } catch {
    // ignore
  }
}

function createPendingRenderPromise(storyId: string): Promise<void> {
  const channel = getChannel()

  // New call supersedes any previous pending request
  if (channel.pendingStory) {
    try {
      channel.pendingStory.reject(
        new Error(`Superseded pending changeStory("${channel.pendingStory.storyId}")`)
      )
    } catch {
      // ignore
    }
    channel.pendingStory = null
  }

  return new Promise<void>((resolve, reject) => {
    channel.pendingStory = { storyId, resolve, reject }
  })
}

function attachClientSocket(socket: WebSocket) {
  const channel = getChannel()
  const previousSocket = channel.client?.socket

  // When app restarts during tests, a new socket connects.
  // Close the old one to prevent stale sockets and listener accumulation.
  if (previousSocket && previousSocket !== socket) {
    try {
      previousSocket.close()
    } catch {
      // ignore
    }
  }

  channel.client = {
    socket,
    identifier: channel.client?.identifier,
    connectedAt: Date.now(),
  }

  // Message handler for story events
  socket.on('message', (buffer: Buffer) => {
    const message = safeJsonParse(buffer)

    if (!message) {
      return
    }

    if (message.type === CHANNEL_CREATED) {
      const from = message.from

      if (typeof from === 'string') {
        const currentClient = getChannel().client

        if (currentClient?.socket === socket) {
          currentClient.identifier = from
        }
      }

      log('CHANNEL_CREATED from:', from)
      return
    }

    // Story error during render: fail pending request immediately
    // so tests don't hang waiting for render that will never complete.
    if (message.type === STORY_THREW_EXCEPTION) {
      const storyError = message.args?.[0]
      const error = new Error('Story threw exception during render: ' + JSON.stringify(storyError))

      rejectPendingStory(error)
      return
    }

    // Story rendered successfully: resolve if storyId matches pending request.
    if (message.type === STORY_RENDERED || message.type === STORY_UNCHANGED) {
      const renderedId = extractStoryIdFromMessage(message)

      if (!renderedId) {
        return
      }

      const channel = getChannel()
      const pending = channel.pendingStory

      if (pending && pending.storyId === renderedId) {
        channel.pendingStory = null

        try {
          pending.resolve()
        } catch {
          // ignore
        }
      }
    }
  })

  // Socket close/error: fail pending request immediately.
  // Without this, tests would hang until timeout when device disconnects.
  socket.on('close', () => {
    log('client socket closed')

    const channel = getChannel()

    if (channel.client?.socket === socket) {
      channel.client = null
    }

    rejectPendingStory(new Error('Storybook device socket closed'))
  })

  socket.on('error', (error: any) => {
    log('client socket error:', error?.message ?? error)

    const channel = getChannel()

    if (channel.client?.socket === socket) {
      channel.client = null
    }

    rejectPendingStory(new Error('Storybook device socket error: ' + (error?.message ?? String(error))))
  })
}

// Idempotent server start: multiple spec files call prepareChannel() in beforeAll,
// but we need exactly one WebSocket server per Jest process to avoid port conflicts.
async function ensureServerStarted() {
  const channel = getChannel()

  if (channel.serverPromise) {
    return channel.serverPromise
  }

  channel.serverPromise = (async () => {
    if (channel.server) {
      return
    }

    const server = new WebSocketServer({ port: PORT })
    channel.server = server

    server.on('connection', (socket: WebSocket) => {
      log('client connected')
      attachClientSocket(socket)
    })

    server.on('error', (error: any) => {
      log('server error:', error?.message ?? error)
    })

    log('server started on port', PORT)
  })()

  return channel.serverPromise
}

export async function prepareChannel() {
  await ensureServerStarted()
}

// Idempotent reverse port: repeated reverseTcpPort calls can degrade/stall adb,
// causing "The app seems to be idle" failures. One reverse per Jest process is enough.
export async function routeFromDeviceToServer() {
  const channel = getChannel()

  if (channel.routePromise) {
    return channel.routePromise
  }

  channel.routePromise = (async () => {
    try {
      await device.reverseTcpPort(PORT)
      log('reverseTcpPort ok:', PORT)
    } catch (error: any) {
      // Allow retry on next call if reverse failed (e.g., adb restart needed).
      channel.routePromise = null
      log('reverseTcpPort failed:', error?.message ?? error)
      throw error
    }
  })()

  return channel.routePromise
}

// Complete cleanup: reject pending request, close client socket, close server.
// Resets all promises so next test run starts fresh.
export async function closeChannel() {
  const channel = getChannel()

  try {
    rejectPendingStory(new Error('Channel closed'))
  } catch {
    // ignore
  }

  channel.routePromise = null

  try {
    channel.client?.socket?.close?.()
  } catch {
    // ignore
  }

  channel.client = null

  if (!channel.server) {
    return
  }

  await new Promise<void>((resolve) => channel.server?.close(() => resolve()))
  channel.server = undefined
  channel.serverPromise = null
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

export async function changeStory(storyId: string) {
  await ensureServerStarted()
  await routeFromDeviceToServer()

  const connectTimeoutMs = Number(process.env.STORYBOOK_WS_CONNECT_TIMEOUT_MS || 60_000)
  const changeTimeoutMs = Number(process.env.STORYBOOK_CHANGE_STORY_TIMEOUT_MS || 20_000)
  // If no client or socket closed, try to restart app to force reconnect
  const existingSocket = getChannel().client?.socket

  if (!existingSocket || (existingSocket as any).readyState !== WS_OPEN) {
    log('No open socket, restarting app to force reconnect')

    try {
      await device.launchApp({ newInstance: true })
    } catch (error: any) {
      log('launchApp failed:', error?.message ?? error)
    }
  }

  const socket = await waitForOpenClientSocket(connectTimeoutMs)

  // Create pending BEFORE send to avoid race condition
  // if STORY_RENDERED arrives before pending is registered.
  const waitForRender = createPendingRenderPromise(storyId)

  try {
    socket.send(JSON.stringify({ type: SET_CURRENT_STORY, args: [{ storyId }] }))
  } catch (error: any) {
    const channel = getChannel()

    if (channel.pendingStory?.storyId === storyId) {
      try {
        channel.pendingStory.reject(
          new Error('Failed to send SET_CURRENT_STORY: ' + (error?.message ?? String(error)))
        )
      } catch {
        // ignore
      }
      channel.pendingStory = null
    }
    throw error
  }

  try {
    await withTimeout(`App timed out changing stories: ${storyId}`, waitForRender, changeTimeoutMs)
  } catch (error: any) {
    const channel = getChannel()

    if (channel.pendingStory?.storyId === storyId) {
      const pending = channel.pendingStory

      channel.pendingStory = null

      try {
        pending.reject(
          error instanceof Error ? error : new Error(String(error))
        )
      } catch {
        // ignore
      }
    }

    throw error
  } finally {
    const channel = getChannel()

    if (channel.pendingStory?.storyId === storyId) {
      channel.pendingStory = null
    }
  }
}
