import { afterEach, beforeEach, expect, test } from '@jest/globals'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { mockStorybookInternals, restoreStorybookInternalsMock } from '../storybook-internals.spec-support'
import { UnsupportedCsfNextError } from './csf-format'
import { generateTests } from './generate-tests'

const tempProjects: string[] = []

beforeEach(() => {
  mockStorybookInternals()
})

afterEach(() => {
  restoreStorybookInternalsMock()

  for (const projectRoot of tempProjects.splice(0)) {
    clearRequireCache(projectRoot)
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('given storybook main with stories, then specs are generated for matching CSF files', async () => {
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
  const result = await generateTests(project.directories)

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

test('given stories with the same basename in different directories, then output paths do not collide', async () => {
  // Given
  const project = createTempProject()
  project.writeStory('src/a/Button.stories.tsx', storySource('Components/A/Button'))
  project.writeStory('src/b/Button.stories.tsx', storySource('Components/B/Button'))

  // When
  await generateTests(project.directories)

  // Then
  expect(existsSync(join(project.directories.testDirectory, 'src/a/Button.stories.spec.js'))).toBe(true)
  expect(existsSync(join(project.directories.testDirectory, 'src/b/Button.stories.spec.js'))).toBe(true)
})

test('given CSF Next factory story, then a readable unsupported format error is thrown', async () => {
  // Given
  const project = createTempProject()
  const storyFile = project.writeStory('src/Button.stories.tsx', `
    import preview from '../.storybook/preview'

    const meta = preview.meta({
      title: 'Components/Button'
    })

    export const Primary = meta.story({
      name: 'Primary button'
    })
  `)

  // When
  const error = await captureGenerateTestsError(project)

  // Then
  expect(error).toBeInstanceOf(UnsupportedCsfNextError)
  expect((error as Error).message).toContain(`Unsupported CSF Next/factory stories in "${storyFile}".`)
  expect((error as Error).message).toContain('Unsupported story export(s): Primary')
  expect((error as Error).message).toContain('Use CSF3 object stories for Detox tests')
  expect(existsSync(join(project.directories.testDirectory, 'src/Button.stories.spec.js'))).toBe(false)
})

test('given mixed factory and non-factory stories, then the whole file is rejected with a readable error', async () => {
  // Given
  const project = createTempProject()
  const storyFile = project.writeStory('src/Button.stories.tsx', `
    import preview from '../.storybook/preview'

    const meta = preview.meta({
      title: 'Components/Button'
    })

    export const Primary = meta.story({
      name: 'Primary button'
    })

    export const Secondary = {
      name: 'Secondary button'
    }
  `)

  // When
  const error = await captureGenerateTestsError(project)

  // Then
  expect(error).toBeInstanceOf(UnsupportedCsfNextError)
  expect((error as Error).message).toContain(`Unsupported CSF Next/factory stories in "${storyFile}".`)
  expect((error as Error).message).toContain('Storybook reported mixed factory and non-factory stories in this file.')
  expect((error as Error).message).toContain('Unsupported story export(s): Primary')
  expect(existsSync(join(project.directories.testDirectory, 'src/Button.stories.spec.js'))).toBe(false)
})

test('given a valid file before an unsupported CSF Next file, then no partial specs are written', async () => {
  // Given
  const project = createTempProject({
    mainSource: "module.exports = { stories: ['../src/AValid.stories.tsx', '../src/ZFactory.stories.tsx'] }\n"
  })
  project.writeStory('src/AValid.stories.tsx', storySource('Components/AValid'))
  project.writeStory('src/ZFactory.stories.tsx', `
    import preview from '../.storybook/preview'

    const meta = preview.meta({
      title: 'Components/ZFactory'
    })

    export const Primary = meta.story({
      name: 'Primary button'
    })
  `)

  // When
  const error = await captureGenerateTestsError(project)

  // Then
  expect(error).toBeInstanceOf(UnsupportedCsfNextError)
  expect(existsSync(join(project.directories.testDirectory, 'src/AValid.stories.spec.js'))).toBe(false)
  expect(existsSync(join(project.directories.testDirectory, 'src/ZFactory.stories.spec.js'))).toBe(false)
})

test('given main.js stories is a function, then specs are generated from resolved stories', async () => {
  // Given
  const project = createTempProject({ mainSource: null })
  rewriteMainSource(project, `
    module.exports = {
      stories: async (entries, options) => {
        if (entries.length !== 0) {
          throw new Error('Expected raw stories entries')
        }
        if (options.configDir !== ${JSON.stringify(project.directories.storybookConfigDirectory)}) {
          throw new Error('Expected configDir option')
        }
        if (options.cwd !== ${JSON.stringify(project.directories.projectRoot)}) {
          throw new Error('Expected cwd option')
        }
        return ['../src/**/*.stories.tsx']
      }
    }
  `)
  const storyFile = project.writeStory('src/Button.stories.tsx', storySource('Components/Button'))

  // When
  const result = await generateTests(project.directories)

  // Then
  expect(result.csfsToTest).toEqual([storyFile])
})

test('given main.js stories function returns a non-array, then a readable error is thrown', async () => {
  // Given
  const project = createTempProject({
    mainSource: 'module.exports = { stories: async () => "not an array" }\n'
  })

  // When / Then
  await expect(generateTests(project.directories)).rejects.toThrow(
    `Could not find stories in main.js in "${project.directories.storybookConfigDirectory}".`
  )
})

test('given main.js stories function throws, then a readable error is thrown', async () => {
  // Given
  const project = createTempProject({
    mainSource: 'module.exports = { stories: async () => { throw new Error("boom") } }\n'
  })

  // When / Then
  await expect(generateTests(project.directories)).rejects.toThrow(
    `Could not load stories from main.js in "${project.directories.storybookConfigDirectory}": boom`
  )
})

test('given main.js is missing, then a readable error is thrown', async () => {
  // Given
  const project = createTempProject({ mainSource: null })

  // When / Then
  await expect(generateTests(project.directories)).rejects.toThrow(
    `Could not load main.js in ${project.directories.storybookConfigDirectory}.`
  )
})

test('given main.js does not define stories, then a readable error is thrown', async () => {
  // Given
  const project = createTempProject({ mainSource: 'module.exports = {}\n' })

  // When / Then
  await expect(generateTests(project.directories)).rejects.toThrow(
    `Could not find stories in main.js in "${project.directories.storybookConfigDirectory}".`
  )
})

test('given main.js defines empty stories, then a readable error is thrown', async () => {
  // Given
  const project = createTempProject({ mainSource: 'module.exports = { stories: [] }\n' })

  // When / Then
  await expect(generateTests(project.directories)).rejects.toThrow(
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

async function captureGenerateTestsError (
  project: ReturnType<typeof createTempProject>
) {
  let capturedError: unknown

  try {
    await generateTests(project.directories)
  } catch (error) {
    capturedError = error
  }

  if (!capturedError) {
    throw new Error('Expected generateTests to throw')
  }

  return capturedError
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

function rewriteMainSource (
  project: ReturnType<typeof createTempProject>,
  mainSource: string
) {
  writeFileSync(join(project.directories.storybookConfigDirectory, 'main.js'), mainSource)
}

function clearRequireCache (projectRoot: string) {
  for (const cachedPath of Object.keys(require.cache)) {
    if (cachedPath.startsWith(projectRoot)) {
      delete require.cache[cachedPath]
    }
  }
}
