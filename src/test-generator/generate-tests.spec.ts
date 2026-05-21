import { afterEach, expect, test } from '@jest/globals'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generateTests } from './generate-tests'

const tempProjects: string[] = []

afterEach(() => {
  for (const projectRoot of tempProjects.splice(0)) {
    clearRequireCache(projectRoot)
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('given storybook main with stories, then specs are generated for matching CSF files', () => {
  // Given
  const project = createTempProject()
  const storyFile = project.writeStory('src/Button.stories.tsx', `
    export default {
      title: 'Components/Button'
    }

    export const Primary = {
      name: 'Primary button',
      detox: {
        launch: {
          permissions: {
            notifications: 'YES'
          }
        }
      },
      play: async () => {}
    }
  `)

  // When
  const result = generateTests(project.directories)

  // Then
  expect(result.csfsToTest).toEqual([storyFile])
  expect(existsSync(project.directories.testDirectory)).toBe(true)

  const generatedSpec = readGeneratedSpec(project, 'src/Button.stories.spec.js')

  expect(generatedSpec).toContain(`const story = require('${storyFile}')`)
  expect(generatedSpec).toMatch(/const channel = require\('.*channel\.js'\)/)
  expect(generatedSpec).toContain("const detox = require('detox')")
  expect(generatedSpec).toContain("testOrSkip(story.Primary.detox?.onlyOnOperatingSystems)('Primary button'")
  expect(generatedSpec).toContain('await device.launchApp(story.Primary.detox?.launch)')
  expect(generatedSpec).toContain("await channel.changeStory('components-button--primary')")
  expect(generatedSpec).toContain('await story.Primary.play?.({ detox })')
})

test('given stories with the same basename in different directories, then output paths do not collide', () => {
  // Given
  const project = createTempProject()
  project.writeStory('src/a/Button.stories.tsx', storySource('Components/A/Button'))
  project.writeStory('src/b/Button.stories.tsx', storySource('Components/B/Button'))

  // When
  generateTests(project.directories)

  // Then
  expect(existsSync(join(project.directories.testDirectory, 'src/a/Button.stories.spec.js'))).toBe(true)
  expect(existsSync(join(project.directories.testDirectory, 'src/b/Button.stories.spec.js'))).toBe(true)
})

test('given main.js is missing, then a readable error is thrown', () => {
  // Given
  const project = createTempProject({ mainSource: null })

  // When / Then
  expect(() => generateTests(project.directories)).toThrow(
    `Could not load main.js in ${project.directories.storybookConfigDirectory}.`
  )
})

test('given main.js does not define stories, then a readable error is thrown', () => {
  // Given
  const project = createTempProject({ mainSource: 'module.exports = {}\n' })

  // When / Then
  expect(() => generateTests(project.directories)).toThrow(
    `Could not find stories in main.js in "${project.directories.storybookConfigDirectory}".`
  )
})

test('given main.js defines empty stories, then a readable error is thrown', () => {
  // Given
  const project = createTempProject({ mainSource: 'module.exports = { stories: [] }\n' })

  // When / Then
  expect(() => generateTests(project.directories)).toThrow(
    `Could not find stories in main.js in "${project.directories.storybookConfigDirectory}".`
  )
})

function createTempProject ({
  mainSource = "module.exports = { stories: ['../src/**/*.stories.tsx'] }\n"
}: {
  mainSource?: string | null
} = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'storybook-detox-test-runner-'))
  const storybookConfigDirectory = join(projectRoot, '.storybook')
  const testDirectory = join(storybookConfigDirectory, '.detox-tests')

  tempProjects.push(projectRoot)
  mkdirSync(storybookConfigDirectory, { recursive: true })

  if (mainSource !== null) {
    writeFileSync(join(storybookConfigDirectory, 'main.js'), mainSource)
  }

  return {
    directories: {
      projectRoot,
      storybookConfigDirectory,
      testDirectory
    },
    writeStory (relativePath: string, source: string) {
      const absolutePath = join(projectRoot, relativePath)

      mkdirSync(join(absolutePath, '..'), { recursive: true })
      writeFileSync(absolutePath, source)

      return absolutePath
    }
  }
}

function readGeneratedSpec (
  project: ReturnType<typeof createTempProject>,
  relativePath: string
) {
  return readFileSync(join(project.directories.testDirectory, relativePath), 'utf-8')
}

function storySource (title: string) {
  return `
    export default {
      title: '${title}'
    }

    export const Primary = {
      name: 'Primary button'
    }
  `
}

function clearRequireCache (projectRoot: string) {
  for (const cachedPath of Object.keys(require.cache)) {
    if (cachedPath.startsWith(projectRoot)) {
      delete require.cache[cachedPath]
    }
  }
}
