import { afterEach, expect, test } from '@jest/globals'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, sep } from 'path'
import { getDirectories } from './get-directories'

const originalCwd = process.cwd()
const originalStorybookConfigDir = process.env.STORYBOOK_CONFIG_DIR
const tempDirectories: string[] = []

afterEach(() => {
  restoreEnv('STORYBOOK_CONFIG_DIR', originalStorybookConfigDir)
  process.chdir(originalCwd)

  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('given no STORYBOOK_CONFIG_DIR, then default storybook directories are returned', () => {
  // Given
  const projectRoot = createTempDirectory()

  process.chdir(projectRoot)
  delete process.env.STORYBOOK_CONFIG_DIR
  const resolvedProjectRoot = process.cwd()

  // When
  const directories = getDirectories()

  // Then
  expect(directories).toEqual({
    projectRoot: withTrailingSeparator(resolvedProjectRoot),
    storybookConfigDirectory: join(resolvedProjectRoot, '.storybook'),
    testDirectory: join(resolvedProjectRoot, '.storybook', '.detox-tests')
  })
})

test('given relative STORYBOOK_CONFIG_DIR, then custom storybook directories are returned', () => {
  // Given
  const projectRoot = createTempDirectory()

  process.chdir(projectRoot)
  process.env.STORYBOOK_CONFIG_DIR = 'config/storybook'
  const resolvedProjectRoot = process.cwd()

  // When
  const directories = getDirectories()

  // Then
  expect(directories).toEqual({
    projectRoot: withTrailingSeparator(resolvedProjectRoot),
    storybookConfigDirectory: join(resolvedProjectRoot, 'config/storybook'),
    testDirectory: join(resolvedProjectRoot, 'config/storybook', '.detox-tests')
  })
})

function createTempDirectory () {
  const directory = mkdtempSync(join(tmpdir(), 'storybook-detox-test-runner-'))

  tempDirectories.push(directory)

  return directory
}

function withTrailingSeparator (path: string) {
  return path.endsWith(sep) ? path : `${path}${sep}`
}

function restoreEnv (name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}
