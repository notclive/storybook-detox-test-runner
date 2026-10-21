import type { StaticStory, StorybookCsfFile, StorybookCsfParseResult } from '../storybook-internals'

type UnsupportedCsfNextSource = 'stats' | 'internal' | 'ast' | 'mixed-factory-error'

export type UnsupportedCsfNextDetection = {
  filePath: string
  exports: string[]
  mixed: boolean
  source: UnsupportedCsfNextSource
}

export class UnsupportedCsfNextError extends Error {
  readonly detection: UnsupportedCsfNextDetection
  readonly cause?: unknown

  constructor (detection: UnsupportedCsfNextDetection, cause?: unknown) {
    super(formatUnsupportedCsfNextMessage(detection))
    this.name = 'UnsupportedCsfNextError'
    this.detection = detection
    this.cause = cause
  }
}

export function detectUnsupportedCsfNext (
  csf: StorybookCsfFile,
  parsed: StorybookCsfParseResult | undefined,
  csfFilePath: string,
  fallbackFactoryStoryExports: string[]
): UnsupportedCsfNextDetection | undefined {
  const stories = parsed?._stories ?? csf._stories
  const factoryStoryExports = getFactoryStoryExportsFromStories(stories)

  if (factoryStoryExports.length > 0) {
    return {
      filePath: csfFilePath,
      exports: factoryStoryExports,
      mixed: false,
      source: 'stats'
    }
  }

  if (parsed?._metaIsFactory === true || csf._metaIsFactory === true) {
    return {
      filePath: csfFilePath,
      exports: unique(fallbackFactoryStoryExports.length > 0 ? fallbackFactoryStoryExports : Object.keys(stories ?? {})),
      mixed: false,
      source: 'internal'
    }
  }

  if (fallbackFactoryStoryExports.length > 0) {
    return {
      filePath: csfFilePath,
      exports: unique(fallbackFactoryStoryExports),
      mixed: false,
      source: 'ast'
    }
  }

  return undefined
}

export function createMixedFactoryDetection (
  csfFilePath: string,
  fallbackFactoryStoryExports: string[]
): UnsupportedCsfNextDetection {
  return {
    filePath: csfFilePath,
    exports: unique(fallbackFactoryStoryExports),
    mixed: true,
    source: 'mixed-factory-error'
  }
}

export function isMixedFactoryError (error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const { name, constructor, message } = error as {
    name?: unknown
    constructor?: { name?: unknown }
    message?: unknown
  }

  return (
    name === 'MixedFactoryError' ||
    constructor?.name === 'MixedFactoryError' ||
    (typeof message === 'string' && message.includes('expected factory story')) ||
    (typeof message === 'string' && message.includes('expected non-factory story'))
  )
}

function getFactoryStoryExportsFromStories (stories: Record<string, StaticStory> | undefined) {
  if (!stories) {
    return []
  }

  return Object.entries(stories)
    .filter(([, story]) => story.__stats?.factory === true)
    .map(([storyExport]) => storyExport)
}

function formatUnsupportedCsfNextMessage (detection: UnsupportedCsfNextDetection) {
  const lines = [
    `Unsupported CSF Next/factory stories in "${detection.filePath}".`,
    '',
    'storybook-detox-test-runner currently supports CSF3 object stories for Detox tests.',
    'CSF Next/factory stories are not supported yet, so the runner cannot generate a correct Detox spec for this file.'
  ]

  if (detection.mixed) {
    lines.push('', 'Storybook reported mixed factory and non-factory stories in this file.')
  }

  if (detection.exports.length > 0) {
    lines.push('', `Unsupported story export(s): ${detection.exports.join(', ')}`)
  }

  lines.push(
    '',
    'Use CSF3 object stories for Detox tests, for example:',
    'export const Primary = { play: async ({ detox }) => { ... } }'
  )

  return lines.join('\n')
}

function unique (values: string[]) {
  return Array.from(new Set(values))
}
