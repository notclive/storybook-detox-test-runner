import { loadStorybookCsfTools, type StorybookCsfFile } from '../storybook-internals'
import * as babel from './csf-babel'
import * as estree from './csf-estree'

/**
 * The part of reading a story file that looks at its syntax. Storybook 9 and
 * 10 hand out Babel nodes and Storybook 11 ESTree nodes, so it has one
 * implementation for each: csf-babel.ts and csf-estree.ts.
 */
export type CsfAdapter = {
  /** The exports written as `meta.story(...)` on a `meta` from the preview. */
  getFactoryStoryExportsFromAst: (csf: StorybookCsfFile) => string[]
}

/**
 * Picks the implementation by whether the installed csf-tools has
 * `parseModule`, which only the ESTree csf-tools of Storybook 11 export. Both
 * are loaded on every version, as neither imports anything from Storybook.
 */
export async function loadCsfAdapter (): Promise<CsfAdapter> {
  const csfTools = await loadStorybookCsfTools()

  return typeof csfTools.parseModule === 'function' ? estree : babel
}
