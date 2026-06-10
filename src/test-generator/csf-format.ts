import type { StaticStory, StorybookCsfFile, StorybookCsfParseResult } from '../storybook-internals'

type UnsupportedCsfNextSource = 'stats' | 'internal' | 'ast' | 'mixed-factory-error'

export type UnsupportedCsfNextDetection = {
  filePath: string
  exports: string[]
  mixed: boolean
  source: UnsupportedCsfNextSource
}

type AstNode = {
  type?: string
  [key: string]: unknown
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
  fallbackFactoryStoryExports = getFactoryStoryExportsFromAst(csf)
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

export function getFactoryStoryExportsFromAst (csf: StorybookCsfFile) {
  const ast = csf._ast
  const previewConfigImports = getPreviewConfigImportNames(ast)
  const factoryMetaVariables = new Set<string>()
  const factoryStoryVariables = new Set<string>()
  const factoryStoryExports = new Set<string>()

  traverseAst(ast, node => {
    if (node.type !== 'VariableDeclarator' || !isIdentifier(node.id)) {
      return
    }

    const init = unwrapExpression(node.init)

    if (isMetaFactoryCall(init, previewConfigImports)) {
      factoryMetaVariables.add(node.id.name)
    }
  })

  traverseAst(ast, node => {
    if (node.type !== 'VariableDeclarator' || !isIdentifier(node.id)) {
      return
    }

    const init = unwrapExpression(node.init)

    if (isFactoryStoryCall(init, factoryMetaVariables, previewConfigImports)) {
      factoryStoryVariables.add(node.id.name)
    }
  })

  traverseAst(ast, node => {
    if (node.type !== 'ExportNamedDeclaration') {
      return
    }

    const declaration = node.declaration

    if (isVariableDeclaration(declaration)) {
      for (const declarator of declaration.declarations) {
        if (!isNode(declarator) || !isIdentifier(declarator.id)) {
          continue
        }

        if (isFactoryStoryCall(unwrapExpression(declarator.init), factoryMetaVariables, previewConfigImports)) {
          factoryStoryExports.add(declarator.id.name)
        }
      }
    }

    if (Array.isArray(node.specifiers)) {
      for (const specifier of node.specifiers) {
        if (!isNode(specifier) || specifier.type !== 'ExportSpecifier' || !isIdentifier(specifier.local)) {
          continue
        }

        if (!factoryStoryVariables.has(specifier.local.name)) {
          continue
        }

        factoryStoryExports.add(isIdentifier(specifier.exported) ? specifier.exported.name : specifier.local.name)
      }
    }
  })

  return Array.from(factoryStoryExports)
}

function getPreviewConfigImportNames (ast: unknown) {
  const imports = new Set<string>()

  traverseAst(ast, node => {
    if (node.type !== 'ImportDeclaration' || !hasImportSource(node.source) || !Array.isArray(node.specifiers)) {
      return
    }

    if (!isPreviewConfigImport(node.source.value)) {
      return
    }

    for (const specifier of node.specifiers) {
      if (!isNode(specifier) || !isIdentifier(specifier.local)) {
        continue
      }

      imports.add(specifier.local.name)
    }
  })

  return imports
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

function traverseAst (value: unknown, visit: (node: AstNode) => void) {
  if (!isNode(value)) {
    return
  }

  visit(value)

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      child.forEach(item => traverseAst(item, visit))
    } else if (isNode(child)) {
      traverseAst(child, visit)
    }
  }
}

function unwrapExpression (value: unknown): unknown {
  let current = value

  while (
    isNode(current) &&
    (
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TypeCastExpression'
    )
  ) {
    current = current.expression
  }

  return current
}

function isFactoryStoryCall (
  value: unknown,
  factoryMetaVariables: Set<string>,
  previewConfigImports: Set<string>
) {
  if (!isNode(value) || value.type !== 'CallExpression' || !isMemberExpression(value.callee)) {
    return false
  }

  if (!isPropertyNamed(value.callee.property, 'story')) {
    return false
  }

  return (
    (isIdentifier(value.callee.object) && factoryMetaVariables.has(value.callee.object.name)) ||
    isMetaFactoryCall(value.callee.object, previewConfigImports)
  )
}

function isMetaFactoryCall (value: unknown, previewConfigImports: Set<string>) {
  return (
    isNode(value) &&
    value.type === 'CallExpression' &&
    isMemberExpression(value.callee) &&
    isIdentifier(value.callee.object) &&
    previewConfigImports.has(value.callee.object.name) &&
    isPropertyNamed(value.callee.property, 'meta')
  )
}

function isVariableDeclaration (value: unknown): value is AstNode & { declarations: unknown[] } {
  return isNode(value) && value.type === 'VariableDeclaration' && Array.isArray(value.declarations)
}

function isMemberExpression (value: unknown): value is AstNode & { object: unknown, property: unknown } {
  return isNode(value) && value.type === 'MemberExpression'
}

function isIdentifier (value: unknown): value is AstNode & { name: string } {
  return isNode(value) && value.type === 'Identifier' && typeof value.name === 'string'
}

function hasImportSource (value: unknown): value is AstNode & { value: string } {
  return isNode(value) && typeof value.value === 'string'
}

function isPropertyNamed (value: unknown, name: string) {
  return (
    (isIdentifier(value) && value.name === name) ||
    (
      isNode(value) &&
      value.type === 'StringLiteral' &&
      value.value === name
    )
  )
}

function isPreviewConfigImport (value: string) {
  return /(^|\/)\.(?:rn)?storybook\/preview(?:\.[cm]?[jt]sx?)?$/.test(value)
}

function isNode (value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string'
}

function unique (values: string[]) {
  return Array.from(new Set(values))
}
