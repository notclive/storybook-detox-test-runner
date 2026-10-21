import { describe } from '@jest/globals'
import { execFileSync } from 'child_process'
import { join } from 'path'
import type { StorybookCsfFile } from '../storybook-internals'

export type CsfToolsKind = 'babel' | 'estree'

type FactoryStoryCase = { name: string, code: string, exports: string[] }

// Jest's module loader cannot load the ES modules of Storybook 10 and 11, so a
// Node process parses the cases with the installed csf-tools and returns what
// loadCsf put on `_ast` (Babel) or `program` (ESTree) as JSON.
const parseWithInstalledCsfTools = `
  import { readFileSync } from 'node:fs'
  const csfTools = await import('storybook/internal/csf-tools')
  const kind = typeof csfTools.parseModule === 'function' ? 'estree' : 'babel'
  const files = JSON.parse(readFileSync(0, 'utf8')).map(code => {
    const csf = csfTools.loadCsf(code, { fileName: 'Button.stories.tsx', makeTitle: title => title ?? 'Button' })
    return { _ast: csf._ast, program: csf.program }
  })
  process.stdout.write(JSON.stringify({ kind, files }))
`

function parseCases (cases: FactoryStoryCase[]) {
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', parseWithInstalledCsfTools], {
    cwd: join(__dirname, '..', '..'),
    input: JSON.stringify(cases.map(({ code }) => code)),
    maxBuffer: 64 * 1024 * 1024
  })
  const { kind, files } = JSON.parse(output.toString()) as { kind: CsfToolsKind, files: StorybookCsfFile[] }

  return { kind, cases: cases.map((testCase, index) => ({ ...testCase, csf: files[index] })) }
}

const needs: Record<CsfToolsKind, string> = {
  babel: 'the Babel csf-tools of Storybook 9 or 10',
  estree: 'the ESTree csf-tools of Storybook 11 (storybookjs/storybook#36613)'
}

/**
 * Runs `fn` with the factory story cases parsed by the installed csf-tools,
 * in a describe that is skipped, with the reason in its name, when those
 * csf-tools are not the given kind. The kind is decided the way
 * loadCsfAdapter decides it: by whether they export `parseModule`.
 */
export function describeWithParsedCases (
  kind: CsfToolsKind,
  name: string,
  fn: (cases: Array<FactoryStoryCase & { csf: StorybookCsfFile }>) => void
) {
  const parsed = parseCases(factoryStoryCases)

  if (parsed.kind === kind) {
    describe(name, () => fn(parsed.cases))
  } else {
    describe.skip(`${name} (needs ${needs[kind]})`, () => fn(parsed.cases))
  }
}

/**
 * Story files with the factory story exports both csf-babel.ts and
 * csf-estree.ts must find in them, parsed by the installed csf-tools.
 */
const factoryStoryCases: FactoryStoryCase[] = [
  {
    name: 'an exported meta.story call',
    code: `
      import preview from '../.storybook/preview'
      const meta = preview.meta({ title: 'Button' })
      export const Primary = meta.story({})
    `,
    exports: ['Primary']
  },
  {
    name: 'a parenthesized meta.story call',
    code: `
      import preview from '../.storybook/preview'
      const meta = preview.meta({ title: 'Button' })
      export const Primary = (meta.story({}))
    `,
    exports: ['Primary']
  },
  {
    name: 'a meta.story call cast with as',
    code: `
      import preview from '../.storybook/preview'
      const meta = preview.meta({ title: 'Button' })
      export const Primary = meta.story({}) as any
    `,
    exports: ['Primary']
  },
  {
    name: 'a meta.story call checked with satisfies',
    code: `
      import preview from '../.storybook/preview'
      const meta = preview.meta({ title: 'Button' })
      export const Primary = meta.story({}) satisfies object
    `,
    exports: ['Primary']
  },
  {
    name: 'a computed meta[\'story\'] call',
    code: `
      import preview from '../.storybook/preview'
      const meta = preview.meta({ title: 'Button' })
      export const Primary = meta['story']({})
    `,
    exports: ['Primary']
  },
  {
    name: 'a factory story exported under another name',
    code: `
      import preview from '../.storybook/preview'
      const meta = preview.meta({ title: 'Button' })
      const Primary = meta.story({})
      export { Primary as Main }
    `,
    exports: ['Main']
  },
  {
    name: 'a story on an inline preview.meta call',
    code: `
      import preview from '../.storybook/preview'
      export const Primary = preview.meta({ title: 'Button' }).story({})
    `,
    exports: ['Primary']
  },
  {
    name: 'a story call on a meta that is not from the preview',
    code: `
      import foo from '../dsl/foo'
      const meta = foo.meta({ title: 'Button' })
      export const Primary = meta.story({})
    `,
    exports: []
  },
  {
    name: 'a CSF3 object story',
    code: `
      export default { title: 'Button' }
      export const Primary = {}
    `,
    exports: []
  }
]
