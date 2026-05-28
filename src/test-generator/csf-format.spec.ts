import { expect, test } from '@jest/globals'
import {
  detectUnsupportedCsfNext,
  getFactoryStoryExportsFromAst,
  isMixedFactoryError,
  UnsupportedCsfNextError
} from './csf-format'

test('given an exported meta.story call in AST, then factory story export is detected', () => {
  // Given
  const csf = csfFileWithAst(factoryStoryAst('Primary'))

  // When / Then
  expect(getFactoryStoryExportsFromAst(csf)).toEqual(['Primary'])
})

test('given an exported story call from a non-preview import, then factory story export is not detected', () => {
  // Given
  const csf = csfFileWithAst(foreignDslStoryAst('Primary'))

  // When / Then
  expect(getFactoryStoryExportsFromAst(csf)).toEqual([])
})

test('given parsed CSF3 object story stats, then unsupported CSF Next is not detected', () => {
  // Given
  const csf = csfFileWithAst(emptyAst())
  const parsed = {
    ...csf,
    _stories: {
      Primary: {
        id: 'components-button--primary',
        name: 'Primary',
        __stats: {
          factory: false
        }
      }
    }
  }

  // When / Then
  expect(detectUnsupportedCsfNext(csf, parsed, '/project/src/Button.stories.tsx')).toBeUndefined()
})

test('given parsed factory story stats, then unsupported CSF Next detection includes export name', () => {
  // Given
  const csf = csfFileWithAst(emptyAst())
  const parsed = {
    ...csf,
    _stories: {
      Primary: {
        id: 'components-button--primary',
        name: 'Primary',
        __stats: {
          factory: true
        }
      }
    }
  }

  // When
  const detection = detectUnsupportedCsfNext(csf, parsed, '/project/src/Button.stories.tsx')

  // Then
  expect(detection).toEqual({
    filePath: '/project/src/Button.stories.tsx',
    exports: ['Primary'],
    mixed: false,
    source: 'stats'
  })
})

test('given Storybook mixed factory error shape, then it is recognized by duck typing', () => {
  // Given
  const error = new Error('CSF: expected factory story')
  error.name = 'MixedFactoryError'

  // When / Then
  expect(isMixedFactoryError(error)).toBe(true)
})

test('given unsupported CSF Next detection, then error message is actionable', () => {
  // Given
  const cause = new Error('parser boom')
  const error = new UnsupportedCsfNextError({
    filePath: '/project/src/Button.stories.tsx',
    exports: ['Primary'],
    mixed: true,
    source: 'mixed-factory-error'
  }, cause)

  // When / Then
  expect(error.cause).toBe(cause)
  expect(error.message).toContain('Unsupported CSF Next/factory stories in "/project/src/Button.stories.tsx".')
  expect(error.message).toContain('Storybook reported mixed factory and non-factory stories in this file.')
  expect(error.message).toContain('Unsupported story export(s): Primary')
  expect(error.message).toContain('Use CSF3 object stories for Detox tests')
})

function csfFileWithAst (_ast: unknown) {
  return {
    _ast,
    parse () {
      return {
        _ast,
        _stories: {}
      }
    }
  }
}

function emptyAst () {
  return {
    type: 'File',
    program: {
      type: 'Program',
      body: []
    }
  }
}

function factoryStoryAst (storyExportName: string) {
  return {
    type: 'File',
    program: {
      type: 'Program',
      body: [
        importDeclaration('preview', '../.storybook/preview'),
        variableDeclaration('meta', callExpression(memberExpression(identifier('preview'), 'meta'))),
        {
          type: 'ExportNamedDeclaration',
          declaration: variableDeclaration(storyExportName, callExpression(memberExpression(identifier('meta'), 'story'))),
          specifiers: []
        }
      ]
    }
  }
}

function foreignDslStoryAst (storyExportName: string) {
  return {
    type: 'File',
    program: {
      type: 'Program',
      body: [
        importDeclaration('foo', '../dsl/foo'),
        variableDeclaration('meta', callExpression(memberExpression(identifier('foo'), 'meta'))),
        {
          type: 'ExportNamedDeclaration',
          declaration: variableDeclaration(storyExportName, callExpression(memberExpression(identifier('meta'), 'story'))),
          specifiers: []
        }
      ]
    }
  }
}

function importDeclaration (localName: string, source: string) {
  return {
    type: 'ImportDeclaration',
    specifiers: [
      {
        type: 'ImportDefaultSpecifier',
        local: identifier(localName)
      }
    ],
    source: {
      type: 'StringLiteral',
      value: source
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
