import { join } from 'path'
import type { StoriesEntry } from './storybook-internals'

export function mockStorybookInternals() {
  (globalThis as any).__STORYBOOK_DETOX_TEST_INTERNALS__ = {
    common: {
      getStoryTitle ({ userTitle }: { userTitle?: string }) {
        return userTitle
      },
      async loadMainConfig ({ configDir }: { configDir: string }) {
        const mainConfig = require(join(configDir, 'main.js'))

        return mainConfig?.default ?? mainConfig
      },
      normalizeStories (entries: StoriesEntry[]) {
        return entries.map(normalizeStoriesEntry)
      },
      normalizeStoryPath (filename: string) {
        return filename.startsWith('.') ? filename : `./${filename}`
      }
    },
    csfTools: {
      loadCsf (code: string, options: { makeTitle: (userTitle?: string) => string }) {
        const ast = createCsfAst(code)

        return {
          _ast: ast,
          parse () {
            const title = options.makeTitle(parseTitle(code))
            const stories: Record<string, { id: string, name: string, __stats: { factory: boolean } }> = {}
            const exportRegex = /export const (\w+)\s*=\s*\{([\s\S]*?)(?=\n\s*export const|\n\s*$)/g
            const factoryExportRegex = /export const (\w+)\s*=\s*\w+\.story\(\s*\{([\s\S]*?)\}\s*\)/g
            const objectStories: Array<{ variableName: string, storyBody: string }> = []
            const factoryStories: Array<{ variableName: string, storyBody: string }> = []
            let match: RegExpExecArray | null

            while ((match = exportRegex.exec(code))) {
              const [, variableName, storyBody] = match
              objectStories.push({ variableName, storyBody })
            }

            while ((match = factoryExportRegex.exec(code))) {
              const [, variableName, storyBody] = match
              factoryStories.push({ variableName, storyBody })
            }

            if (objectStories.length > 0 && factoryStories.length > 0) {
              throw createMixedFactoryError()
            }

            for (const { variableName, storyBody } of objectStories) {
              const name = parseStoryName(storyBody) ?? variableName

              stories[variableName] = {
                id: `${slugify(title)}--${slugify(variableName)}`,
                name,
                __stats: {
                  factory: false
                }
              }
            }

            for (const { variableName, storyBody } of factoryStories) {
              const name = parseStoryName(storyBody) ?? variableName

              stories[variableName] = {
                id: `${slugify(title)}--${slugify(variableName)}`,
                name,
                __stats: {
                  factory: true
                }
              }
            }

            return {
              _ast: ast,
              _metaIsFactory: factoryStories.length > 0,
              _stories: stories
            }
          }
        }
      }
    }
  }
}

export function restoreStorybookInternalsMock() {
  delete (globalThis as any).__STORYBOOK_DETOX_TEST_INTERNALS__
}

function normalizeStoriesEntry(entry: StoriesEntry) {
  if (typeof entry !== 'string') {
    return {
      directory: entry.directory.replace(/^\.\.\//, ''),
      importPathMatcher: matcherForEntry(`../${entry.directory}/${entry.files ?? '**/*.stories.@(js|jsx|ts|tsx)'}`)
    }
  }

  return {
    directory: getDirectory(entry),
    importPathMatcher: matcherForEntry(entry)
  }
}

function getDirectory(entry: string) {
  if (entry.includes('**')) {
    return entry.slice(0, entry.indexOf('**')).replace(/^\.\.\//, '').replace(/\/$/, '')
  }

  return entry.slice(0, entry.lastIndexOf('/')).replace(/^\.\.\//, '')
}

function matcherForEntry(entry: string) {
  const normalized = entry.replace(/^\.\.\//, './')

  if (normalized.endsWith('/**/*.stories.?(ts|tsx|js|jsx)')) {
    return {
      test: (path: string) => /^\.\/src\/.*\.stories\.(ts|tsx|js|jsx)$/.test(path)
    }
  }

  if (normalized.endsWith('/**/*.stories.tsx')) {
    return {
      test: (path: string) => /^\.\/src\/.*\.stories\.tsx$/.test(path)
    }
  }

  if (normalized.endsWith('/*.stories.ts')) {
    const directory = escapeRegex(normalized.slice(0, normalized.indexOf('*')))

    return {
      test: (path: string) => new RegExp(`^${directory}[^/]*\\.stories\\.ts$`).test(path)
    }
  }

  return {
    test: (path: string) => path === normalized
  }
}

function parseTitle(code: string) {
  return /title:\s*['"]([^'"]+)['"]/.exec(code)?.[1] ?? 'unknown'
}

function parseStoryName(code: string) {
  return /name:\s*['"]([^'"]+)['"]/.exec(code)?.[1]
}

function createCsfAst(code: string) {
  const metaVariableName = /const\s+(\w+)\s*=\s*\w+\.meta\(/.exec(code)?.[1]
  const factoryExportRegex = /export const (\w+)\s*=\s*(\w+)\.story\(/g
  const body: unknown[] = []
  let match: RegExpExecArray | null

  if (metaVariableName) {
    body.push(variableDeclaration(metaVariableName, callExpression(memberExpression(identifier('preview'), 'meta'))))
  }

  while ((match = factoryExportRegex.exec(code))) {
    const [, storyExportName, storyMetaVariableName] = match

    body.push({
      type: 'ExportNamedDeclaration',
      declaration: {
        type: 'VariableDeclaration',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: identifier(storyExportName),
            init: callExpression(memberExpression(identifier(storyMetaVariableName), 'story'))
          }
        ]
      },
      specifiers: []
    })
  }

  return {
    type: 'File',
    program: {
      type: 'Program',
      body
    }
  }
}

function variableDeclaration (name: string, init: unknown) {
  return {
    type: 'VariableDeclaration',
    declarations: [
      {
        type: 'VariableDeclarator',
        id: identifier(name),
        init
      }
    ]
  }
}

function callExpression (callee: unknown) {
  return {
    type: 'CallExpression',
    callee
  }
}

function memberExpression (object: unknown, propertyName: string) {
  return {
    type: 'MemberExpression',
    object,
    property: identifier(propertyName)
  }
}

function identifier (name: string) {
  return {
    type: 'Identifier',
    name
  }
}

function createMixedFactoryError () {
  const error = new Error('CSF: expected factory story')

  error.name = 'MixedFactoryError'

  return error
}

function slugify(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
