import { afterEach, expect, jest, test } from '@jest/globals'
import { createServer } from 'net'
import { WebSocket } from 'ws'

const SET_CURRENT_STORY = 'setCurrentStory'
const STORY_RENDERED = 'storyRendered'
const STORY_THREW_EXCEPTION = 'storyThrewException'
const STORY_UNCHANGED = 'storyUnchanged'
const WS_CLOSED = 3
const ORIGINAL_ENV = {
  STORYBOOK_CHANNEL_DEBUG: process.env.STORYBOOK_CHANNEL_DEBUG,
  STORYBOOK_CHANGE_STORY_TIMEOUT_MS: process.env.STORYBOOK_CHANGE_STORY_TIMEOUT_MS,
  STORYBOOK_WS_CONNECT_TIMEOUT_MS: process.env.STORYBOOK_WS_CONNECT_TIMEOUT_MS,
  STORYBOOK_WS_PORT: process.env.STORYBOOK_WS_PORT,
}

type ChannelModule = typeof import('./channel')
type DeviceMock = {
  getPlatform: jest.Mock<() => string>
  launchApp: jest.Mock<() => Promise<void>>
  reverseTcpPort: jest.Mock<() => Promise<void>>
}

let importedChannel: ChannelModule | null = null
let currentClient: WebSocket | null = null

afterEach(async () => {
  if (importedChannel) {
    await importedChannel.closeChannel()
  }

  if (currentClient) {
    await closeClient(currentClient)
    currentClient = null
  }

  restoreEnv()
  jest.resetModules()
  jest.clearAllMocks()
  importedChannel = null
})

test('given an open websocket client, then changeStory sends setCurrentStory and resolves on storyRendered string payload', async () => {
  const { channel, client, device } = await setupOpenChannel()
  const setCurrentStory = waitForSetCurrentStory(client)

  const changeStory = channel.changeStory('components-button--primary')
  const message = await setCurrentStory

  sendStoryEvent(client, STORY_RENDERED, ['components-button--primary'])

  expect(message).toEqual({
    type: SET_CURRENT_STORY,
    args: [{ storyId: 'components-button--primary' }]
  })
  await expect(changeStory).resolves.toBeUndefined()
  expect(device.reverseTcpPort).not.toHaveBeenCalled()
  expect(device.launchApp).not.toHaveBeenCalled()
})

test('given storyRendered object payload matches the pending story, then changeStory resolves', async () => {
  const { channel, client } = await setupOpenChannel()
  const setCurrentStory = waitForSetCurrentStory(client)


  const changeStory = channel.changeStory('components-button--primary')
  await setCurrentStory

  sendStoryEvent(client, STORY_RENDERED, [{ storyId: 'components-button--primary' }])


  await expect(changeStory).resolves.toBeUndefined()
})

test('given storyUnchanged matches the pending story, then changeStory resolves', async () => {

  const { channel, client } = await setupOpenChannel()
  const setCurrentStory = waitForSetCurrentStory(client)


  const changeStory = channel.changeStory('components-button--primary')
  await setCurrentStory

  sendStoryEvent(client, STORY_UNCHANGED, ['components-button--primary'])


  await expect(changeStory).resolves.toBeUndefined()
})

test('given storyThrewException is received, then changeStory rejects', async () => {
  const { channel, client } = await setupOpenChannel()
  const setCurrentStory = waitForSetCurrentStory(client)

  const changeStory = channel.changeStory('components-button--primary')
  await setCurrentStory

  sendStoryEvent(client, STORY_THREW_EXCEPTION, [{ message: 'boom' }])

  await expect(changeStory).rejects.toThrow('Story threw exception during render')
})

test('given no render event is received, then changeStory rejects on timeout', async () => {
  const { channel, client } = await setupOpenChannel({ changeStoryTimeoutMs: 20 })
  const setCurrentStory = waitForSetCurrentStory(client)

  const changeStory = channel.changeStory('components-button--primary')
  await setCurrentStory

  await expect(changeStory).rejects.toThrow('App timed out changing stories: components-button--primary')
})

test('given the websocket port is already in use, then prepareChannel rejects with setup guidance', async () => {
  const blockingServer = createServer()
  const port = await listenOnFreePort(blockingServer)
  const { channel } = await importChannel(port, 250)

  try {
    await expect(channel.prepareChannel()).rejects.toThrow(
      `Storybook Detox WebSocket server could not start on port ${port}: port is already in use.`
    )
    await expect(channel.prepareChannel()).rejects.toThrow('withStorybook({ websockets })')
  } finally {
    await closeServer(blockingServer)
  }

  await expect(channel.prepareChannel()).resolves.toBeUndefined()
})

async function setupOpenChannel ({
  changeStoryTimeoutMs = 250
}: {
  changeStoryTimeoutMs?: number
} = {}) {
  const port = await getFreePort()
  const { channel, device } = await importChannel(port, changeStoryTimeoutMs)

  await channel.prepareChannel()

  const client = await connectClient(port)

  currentClient = client

  return { channel, client, device }
}

async function importChannel (port: number, changeStoryTimeoutMs: number) {
  const device: DeviceMock = {
    getPlatform: jest.fn(() => 'ios'),
    launchApp: jest.fn(async () => undefined),
    reverseTcpPort: jest.fn(async () => undefined),
  }

  process.env.STORYBOOK_WS_PORT = String(port)
  process.env.STORYBOOK_WS_CONNECT_TIMEOUT_MS = '1000'
  process.env.STORYBOOK_CHANGE_STORY_TIMEOUT_MS = String(changeStoryTimeoutMs)
  delete process.env.STORYBOOK_CHANNEL_DEBUG

  jest.doMock('detox', () => ({ device }))

  const channel = require('./channel') as ChannelModule

  importedChannel = channel

  return { channel, device }
}

async function getFreePort () {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()

      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate a test port'))
        return
      }

      server.close(() => resolve(address.port))
    })
  })
}

async function listenOnFreePort (server: ReturnType<typeof createServer>) {
  return await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, () => {
      server.off('error', reject)

      const address = server.address()

      if (!address || typeof address === 'string') {
        reject(new Error('Could not allocate a test port'))
        return
      }

      resolve(address.port)
    })
  })
}

async function connectClient (port: number) {
  const deadline = Date.now() + 1000
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      const client = await connectClientOnce(port)

      currentClient = client

      return client
    } catch (error) {
      lastError = error
      await sleep(10)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out connecting websocket client')
}

async function connectClientOnce (port: number) {
  const client = new WebSocket(`ws://127.0.0.1:${port}`)

  return await new Promise<WebSocket>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      client.terminate()
      reject(new Error('Timed out waiting for websocket client to open'))
    }, 200)
    const cleanup = () => {
      clearTimeout(timeout)
      client.off('open', onOpen)
      client.off('error', onError)
    }
    const onOpen = () => {
      cleanup()
      resolve(client)
    }
    const onError = (error: Error) => {
      cleanup()
      client.terminate()
      reject(error)
    }

    client.once('open', onOpen)
    client.once('error', onError)
  })
}

async function closeClient (client: WebSocket) {
  if (client.readyState === WS_CLOSED) {
    return
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      client.terminate()
      resolve()
    }, 200)

    client.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })

    client.close()
  })
}

async function closeServer (server: ReturnType<typeof createServer>) {
  if (!server.listening) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function waitForSetCurrentStory (client: WebSocket) {
  return new Promise<{ type: string, args: unknown[] }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for setCurrentStory message'))
    }, 1000)
    const cleanup = () => {
      clearTimeout(timeout)
      client.off('message', onMessage)
      client.off('close', onClose)
      client.off('error', onError)
    }
    const onMessage = (data: Buffer) => {
      const message = JSON.parse(data.toString('utf-8')) as { type: string, args: unknown[] }

      if (message.type === SET_CURRENT_STORY) {
        cleanup()
        resolve(message)
      }
    }
    const onClose = () => {
      cleanup()
      reject(new Error('Websocket closed before setCurrentStory was received'))
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    client.on('message', onMessage)
    client.once('close', onClose)
    client.once('error', onError)
  })
}

function sendStoryEvent (client: WebSocket, type: string, args: unknown[]) {
  client.send(JSON.stringify({ type, args }))
}

function restoreEnv () {
  restoreEnvValue('STORYBOOK_CHANNEL_DEBUG', ORIGINAL_ENV.STORYBOOK_CHANNEL_DEBUG)
  restoreEnvValue('STORYBOOK_CHANGE_STORY_TIMEOUT_MS', ORIGINAL_ENV.STORYBOOK_CHANGE_STORY_TIMEOUT_MS)
  restoreEnvValue('STORYBOOK_WS_CONNECT_TIMEOUT_MS', ORIGINAL_ENV.STORYBOOK_WS_CONNECT_TIMEOUT_MS)
  restoreEnvValue('STORYBOOK_WS_PORT', ORIGINAL_ENV.STORYBOOK_WS_PORT)
}

function restoreEnvValue (name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

function sleep (ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
