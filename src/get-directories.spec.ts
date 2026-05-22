import { afterEach, expect, test } from '@jest/globals'
import mockFilesystem from 'mock-fs'
import { join } from 'path'
import { getDirectories } from './get-directories'

const originalCwd = process.cwd()
const originalStorybookConfigDir = process.env.STORYBOOK_CONFIG_DIR

afterEach(() => {
  restoreEnv('STORYBOOK_CONFIG_DIR', originalStorybookConfigDir)
  mockFilesystem.restore()
  process.chdir(originalCwd)
})

test('given STORYBOOK_CONFIG_DIR, then autodetect is skipped and env directory is returned', () => {
  // Given
  const projectRoot = originalCwd
  mockFilesystem({
    [join(projectRoot, '.rnstorybook')]: {},
    [join(projectRoot, '.storybook')]: {}
  })
  process.env.STORYBOOK_CONFIG_DIR = 'config/storybook'

  // When
  const directories = getDirectories()

  // Then
  expect(directories).toEqual({
    projectRoot,
    storybookConfigDirectory: join(projectRoot, 'config/storybook'),
    testDirectory: join(projectRoot, 'config/storybook', '.detox-tests')
  })
})

test('given no STORYBOOK_CONFIG_DIR and .rnstorybook exists, then .rnstorybook directories are returned', () => {
  // Given
  const projectRoot = originalCwd
  mockFilesystem({
    [join(projectRoot, '.rnstorybook')]: {},
    [join(projectRoot, '.storybook')]: {}
  })
  delete process.env.STORYBOOK_CONFIG_DIR

  // When
  const directories = getDirectories()

  // Then
  expect(directories).toEqual({
    projectRoot,
    storybookConfigDirectory: join(projectRoot, '.rnstorybook'),
    testDirectory: join(projectRoot, '.rnstorybook', '.detox-tests')
  })
})

test('given no STORYBOOK_CONFIG_DIR and only .storybook exists, then .storybook directories are returned', () => {
  // Given
  const projectRoot = originalCwd
  mockFilesystem({
    [join(projectRoot, '.storybook')]: {}
  })
  delete process.env.STORYBOOK_CONFIG_DIR

  // When
  const directories = getDirectories()

  // Then
  expect(directories).toEqual({
    projectRoot,
    storybookConfigDirectory: join(projectRoot, '.storybook'),
    testDirectory: join(projectRoot, '.storybook', '.detox-tests')
  })
})

test('given no STORYBOOK_CONFIG_DIR and no config directory exists, then .rnstorybook directories are returned', () => {
  // Given
  const projectRoot = originalCwd
  mockFilesystem({
    [projectRoot]: {}
  })
  delete process.env.STORYBOOK_CONFIG_DIR

  // When
  const directories = getDirectories()

  // Then
  expect(directories).toEqual({
    projectRoot,
    storybookConfigDirectory: join(projectRoot, '.rnstorybook'),
    testDirectory: join(projectRoot, '.rnstorybook', '.detox-tests')
  })
})

function restoreEnv (name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}
