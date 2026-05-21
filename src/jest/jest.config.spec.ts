import { afterEach, expect, jest, test } from '@jest/globals'
import { join } from 'path'

afterEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  jest.unmock('../get-directories')
  jest.unmock('../test-generator/generate-tests')
})

test('given generated CSF list, then jest config points Detox at generated specs', async () => {
  // Given
  const directories = {
    projectRoot: '/tmp/project/',
    storybookConfigDirectory: '/tmp/project/.storybook',
    testDirectory: '/tmp/project/.storybook/.detox-tests'
  }
  const csfsToTest = [
    '/tmp/project/src/Button.stories.tsx',
    '/tmp/project/src/foo+(bar).stories.tsx'
  ]
  const generateTests = jest.fn(() => ({ csfsToTest }))
  const getDirectories = jest.fn(() => directories)

  jest.doMock('../get-directories', () => ({ getDirectories }))
  jest.doMock('../test-generator/generate-tests', () => ({ generateTests }))

  // When
  const { default: config } = await import('./jest.config')

  // Then
  expect(getDirectories).toHaveBeenCalledTimes(1)
  expect(generateTests).toHaveBeenCalledWith(directories)
  expect(config.rootDir).toBe(directories.projectRoot)
  expect(config.testMatch).toEqual(['/tmp/project/.storybook/.detox-tests/**/*.spec.js'])
  expect(config.globalSetup).toBe(join(__dirname, 'global-setup'))
  expect(config.globalTeardown).toBe(join(__dirname, 'global-teardown'))
  expect(config.testTimeout).toBe(120000)
  expect(config.maxWorkers).toBe(1)
  expect(config.reporters).toEqual(['detox/runners/jest/reporter'])
  expect(config.testEnvironment).toBe('detox/runners/jest/testEnvironment')
  expect(config.verbose).toBe(true)

  const transform = config.transform as Record<string, string>
  const [[storyPathsAsRegex, transformerPath]] = Object.entries(transform)

  expect(storyPathsAsRegex).toBe(
    '/tmp/project/src/Button\\.stories\\.tsx|/tmp/project/src/foo\\+\\(bar\\)\\.stories\\.tsx'
  )
  expect(new RegExp(storyPathsAsRegex).test('/tmp/project/src/foo+(bar).stories.tsx')).toBe(true)
  expect(new RegExp(storyPathsAsRegex).test('/tmp/project/src/foooooobar.stories.tsx')).toBe(false)
  expect(transformerPath).toBe(join(__dirname, 'composing-transformer'))
})
