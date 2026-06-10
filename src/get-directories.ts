import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { env } from 'process'

export function getDirectories () {
  const projectRoot = resolve()
  const storybookConfigDirectory = resolve(projectRoot, getStorybookConfigSubdirectory())

  return {
    projectRoot,
    storybookConfigDirectory,
    testDirectory: join(storybookConfigDirectory, '.detox-tests')
  }
}

function getStorybookConfigSubdirectory () {
  if (env.STORYBOOK_CONFIG_DIR !== undefined) {
    return env.STORYBOOK_CONFIG_DIR
  }

  if (existsSync('.rnstorybook')) {
    return '.rnstorybook'
  }

  if (existsSync('.storybook')) {
    return '.storybook'
  }

  return '.rnstorybook'
}
