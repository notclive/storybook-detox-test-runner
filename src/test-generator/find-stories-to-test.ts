import { normalizeStories, normalizeStoryPath } from '@storybook/core/common'
import type { StoriesEntry } from '@storybook/core/types'
import fs from 'fs'
import { join, relative } from 'path'

export function findStoriesToTest (
  stories: StoriesEntry[],
  { projectRoot, storybookConfigDirectory }: { projectRoot: string, storybookConfigDirectory: string }
) {
  const normalizedStories = normalizeStories(stories, { configDir: storybookConfigDirectory, workingDir: projectRoot })
  const storiesToTestWithDuplicates = normalizedStories.flatMap(({ directory, importPathMatcher }) => {
    return fs.readdirSync(join(projectRoot, directory), { recursive: true, withFileTypes: true })
      .filter(f => f.isFile())
      .map(({ parentPath, name }) => join(parentPath, name))
      .filter(pathToTest => importPathMatcher.test(normalizeStoryPath(relative(projectRoot, pathToTest))))
  })
  return Array.from(new Set(storiesToTestWithDuplicates))
}
