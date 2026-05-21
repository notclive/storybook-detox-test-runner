export type StoriesSpecifier = {
  titlePrefix?: string
  directory: string
  files?: string
}

export type StoriesEntry = string | StoriesSpecifier

export type StaticStory = {
  id: string
  name: string
}

type NormalizedStoriesSpecifier = Required<StoriesSpecifier> & {
  importPathMatcher: RegExp
}

type StorybookCommon = {
  getStoryTitle: (options: {
    storyFilePath: string
    configDir: string
    stories: StoriesEntry[]
    userTitle?: string
  }) => string | undefined
  loadMainConfig: (options: {
    configDir: string
    cwd: string
  }) => Promise<{
    stories?: StoriesConfig
  }>
  normalizeStories: (entries: StoriesEntry[], options: {
    configDir: string
    workingDir: string
  }) => NormalizedStoriesSpecifier[]
  normalizeStoryPath: (filename: string) => string
}

type StorybookCsfTools = {
  loadCsf: (code: string, options: {
    fileName: string
    makeTitle: (userTitle?: string) => string
  }) => {
    parse: () => {
      _stories: Record<string, StaticStory>
    }
  }
}

export type StoriesConfig = StoriesEntry[] | ((
  entries: StoriesEntry[],
  options: { configDir: string, cwd: string }
) => StoriesEntry[] | Promise<StoriesEntry[]>)

let commonPromise: Promise<StorybookCommon> | undefined
let csfToolsPromise: Promise<StorybookCsfTools> | undefined
const nativeImport = new Function('specifier', 'return import(specifier)') as <T>(specifier: string) => Promise<T>

export function loadStorybookCommon() {
  const testCommon = getTestInternals()?.common

  if (testCommon) {
    return Promise.resolve(testCommon)
  }

  commonPromise = commonPromise ?? nativeImport('storybook/internal/common')
    .then(mod => unwrapModule<StorybookCommon>(mod, 'loadMainConfig'))

  return commonPromise
}

export function loadStorybookCsfTools() {
  const testCsfTools = getTestInternals()?.csfTools

  if (testCsfTools) {
    return Promise.resolve(testCsfTools)
  }

  csfToolsPromise = csfToolsPromise ?? nativeImport('storybook/internal/csf-tools')
    .then(mod => unwrapModule<StorybookCsfTools>(mod, 'loadCsf'))

  return csfToolsPromise
}

function getTestInternals() {
  if (process.env.NODE_ENV !== 'test') {
    return undefined
  }

  return (globalThis as {
    __STORYBOOK_DETOX_TEST_INTERNALS__?: {
      common?: StorybookCommon
      csfTools?: StorybookCsfTools
    }
  }).__STORYBOOK_DETOX_TEST_INTERNALS__
}

function unwrapModule<T extends object>(mod: unknown, requiredExport: keyof T): T {
  if (hasExport(mod, requiredExport)) {
    return mod as T
  }

  const defaultExport = (mod as { default?: unknown }).default

  if (hasExport(defaultExport, requiredExport)) {
    return defaultExport as T
  }

  return mod as T
}

function hasExport(mod: unknown, key: PropertyKey) {
  return (
    (typeof mod === 'object' && mod !== null && key in mod) ||
    (typeof mod === 'function' && key in mod)
  )
}
