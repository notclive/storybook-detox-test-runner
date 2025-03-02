import { Visitor } from '@babel/core'

export default function () {
  return {
    visitor: {
      Program: {
        enter: (path) => {
          for (const binding of Object.values(path.scope.bindings)) {
            if (!binding.referenced && binding.kind === 'var' && isRightHandRequire(binding.path.node)) {
              binding.path.remove()
            }
          }
        }
      }
    } satisfies Visitor
  }
}

function isRightHandRequire(binding: babel.types.Node) {
  return binding.type === 'VariableDeclarator'
    && binding.init !== null && binding.init !== undefined
    && binding.init.type === 'CallExpression'
    && binding.init.callee.type === 'Identifier'
    && binding.init.callee.name === 'require'
}