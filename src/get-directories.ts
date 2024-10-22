import { join, resolve } from 'path'
import { env } from 'process'

export function getDirectories () {
  const storybookConfigSubdirectory = env.STORYBOOK_CONFIG_DIR ?? '.storybook'
  const storybookConfigDirectory = resolve(storybookConfigSubdirectory)
  const projectRoot = storybookConfigDirectory.slice(0, -storybookConfigSubdirectory.length)

  return {
    projectRoot,
    storybookConfigDirectory,
    testDirectory: join(storybookConfigDirectory, '.detox-tests')
  }
}
