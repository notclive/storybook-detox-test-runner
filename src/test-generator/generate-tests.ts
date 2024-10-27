import { getStoryTitle, serverRequire } from '@storybook/core/common'
import { loadCsf, type StaticStory } from '@storybook/core/csf-tools'
import type { StoriesEntry, StorybookConfig } from '@storybook/core/types'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { findStoriesToTest as findCsfsToTest } from './find-stories-to-test'

export function generateTests ({
  projectRoot,
  storybookConfigDirectory,
  testDirectory
}: {
  projectRoot: string;
  storybookConfigDirectory: string;
  testDirectory: string;
}) {
  const csfPatterns = getCsfPatterns(storybookConfigDirectory)

  rmSync(testDirectory, { recursive: true, force: true })
  mkdirSync(testDirectory, { recursive: true })

  for (const csfsToTest of findCsfsToTest(
    csfPatterns,
    { projectRoot, storybookConfigDirectory }
  )) {
    const storiesInCsf = parseCsf(csfsToTest, csfPatterns, storybookConfigDirectory)
    const jestTest = generateJestTest(csfsToTest, storiesInCsf)
    writeFileSync(join(testDirectory, `${basename(csfsToTest, extname(csfsToTest))}.spec.js`), jestTest)
  }
}

function getCsfPatterns (configDir: string) {
  // Typescript config is not supported.
  const mainConfig = serverRequire(join(configDir, 'main')) as Partial<StorybookConfig> | undefined
  if (!mainConfig) {
    throw new Error(`Could not load main.js in ${configDir}.`)
  }
  if (!mainConfig.stories || mainConfig.stories.length === 0) {
    throw new Error(`Could not find stories in main.js in "${configDir}".`)
  }
  return mainConfig.stories as StoriesEntry[]
}

function parseCsf (csfFilePath: string, csfPatterns: StoriesEntry[], storybookConfigDirectory: string) {
  const code = readFileSync(csfFilePath, { encoding: 'utf-8' })
  const csf = loadCsf(code, {
    fileName: csfFilePath,
    makeTitle (userTitle) {
      return getStoryTitle({
        storyFilePath: csfFilePath,
        configDir: storybookConfigDirectory,
        stories: csfPatterns,
        userTitle
      }) || 'unknown';
    }
  })
  const { _stories } = csf.parse()
  return _stories
}

function generateJestTest (csfFilePath: string, stories: Record<string, StaticStory>) {
  return `
    const story = require('${csfFilePath}')
    const channel = require('${join(__dirname, '..', 'channel.js')}')

    beforeAll(async () => {
      await channel.routeFromDeviceToServer()
      await device.launchApp()
    })

    ${Object.entries(stories).map(([variableName, story]) => generateTestForStory(variableName, story) + '\n\n')}
  `
}

function generateTestForStory (variableName: string, story: StaticStory) {
  return `test('${story.name}', async function () {
      await channel.changeStory('${story.id}')
      await story.${variableName}.play()
    })`
}
