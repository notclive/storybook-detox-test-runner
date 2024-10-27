import events, { CHANNEL_CREATED, SET_CURRENT_STORY, STORY_RENDERED, STORY_UNCHANGED } from '@storybook/core/core-events'
import { device } from 'detox'
import { WebSocket, WebSocketServer } from 'ws'

interface Channel {
  server?: WebSocketServer
  client?: {
    identifier: string
    socket: WebSocket
  }
}

type Message = {
  type: events
  from: string
  args: any[]
}

// Cannot use module scope variable, require during test execution returns different instance.
// Probably because of transformer.
function getChannel (): Channel {
  globalThis.channel = globalThis.channel ?? {}
  return globalThis.channel
}

export async function prepareChannel () {
  // Fixme: If storybook is running on 7007, use another port.
  const server = new WebSocketServer({ port: 7007 })
  getChannel().server = server
  server.on('connection', (socket) => {
    socket.on('message', (buffer: Buffer) => {
      const message = JSON.parse(buffer.toString('utf-8')) as Message
      if (message.type === CHANNEL_CREATED) {
        // Client will change if app is restarted during tests.
        getChannel().client = {
          identifier: message.from,
          socket
        }
      }
    })
  })
}

export async function routeFromDeviceToServer () {
  await device.reverseTcpPort(7007)
}

export async function closeChannel () {
  return new Promise(resolve => getChannel().server?.close(resolve))
}

export async function changeStory (storyId: string) {
  const socket = getChannel().client?.socket
  if (socket === undefined) {
    throw new Error('Storybook running on device should have connected by now')
  }
  const waitForRender = withTimeout(
    'App timed out changing stories',
    resolveWhenStoryRendered(socket, storyId),
    5 * 1000
  )
  socket.send(JSON.stringify({ type: SET_CURRENT_STORY, args: [{ storyId }] }))
  return waitForRender
}

function resolveWhenStoryRendered (socket: WebSocket, storyId: string) {
  return new Promise<void>(resolve => {
    socket.on('message', (buffer: Buffer) => {
      const message = JSON.parse(buffer.toString('utf-8')) as Message
      if ([STORY_RENDERED, STORY_UNCHANGED].includes(message.type) && message.args[0] === storyId) {
        resolve()
      }
    })
  })
}

function withTimeout<T> (message: string, promise: Promise<T>, timeoutInMs: number) {
  return Promise.race([promise, new Promise<T>((_resolve, reject) => {
    const timeoutId = setTimeout(reject, timeoutInMs, message)
    promise.then(() => { clearTimeout(timeoutId) })
  })])
}
