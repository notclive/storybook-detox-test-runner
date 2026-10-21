import { expect, test } from '@jest/globals'
import { getFactoryStoryExportsFromAst } from './csf-babel'
import { describeWithParsedCases } from './csf-adapter.spec-support'

describeWithParsedCases('babel', 'csf-babel.ts on story files parsed by the installed Storybook', cases => {
  test.each(cases)('given $name, then the factory story exports are $exports', ({ csf, exports }) => {
    expect(getFactoryStoryExportsFromAst(csf)).toEqual(exports)
  })
})

test('given an exported meta.story call in AST, then factory story export is detected', () => {
  // Given
  const csf = csfFileWithAst(factoryStoryAst('Primary'))

  // When / Then
  expect(getFactoryStoryExportsFromAst(csf)).toEqual(['Primary'])
})

test('given an exported computed meta[\'story\'] call in AST, then factory story export is detected', () => {
  // Given
  const csf = csfFileWithAst(factoryStoryAst('Primary', computedMemberExpression(identifier('meta'), 'story')))

  // When / Then
  expect(getFactoryStoryExportsFromAst(csf)).toEqual(['Primary'])
})

test('given an exported story call from a non-preview import, then factory story export is not detected', () => {
  // Given
  const csf = csfFileWithAst(foreignDslStoryAst('Primary'))

  // When / Then
  expect(getFactoryStoryExportsFromAst(csf)).toEqual([])
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

function factoryStoryAst (
  storyExportName: string,
  storyCallee: unknown = memberExpression(identifier('meta'), 'story')
) {
  return {
    type: 'File',
    program: {
      type: 'Program',
      body: [
        importDeclaration('preview', '../.storybook/preview'),
        variableDeclaration('meta', callExpression(memberExpression(identifier('preview'), 'meta'))),
        {
          type: 'ExportNamedDeclaration',
          declaration: variableDeclaration(storyExportName, callExpression(storyCallee)),
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

function computedMemberExpression (object: unknown, propertyName: string) {
  return {
    type: 'MemberExpression',
    object,
    property: { type: 'StringLiteral', value: propertyName },
    computed: true
  }
}

function identifier (name: string) {
  return {
    type: 'Identifier',
    name
  }
}
