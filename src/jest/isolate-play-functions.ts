import { Visitor } from '@babel/core'
import { ObjectMethod, ObjectProperty, SpreadElement } from '@babel/types'

export default function () {
  return {
    visitor: {
      AssignmentExpression (path) {
        if (
          /* Look for `exports.__ = { ___ }`.*/
          path.node.left.type === 'MemberExpression' &&
          path.node.left.object.type === 'Identifier' &&
          path.node.left.object.name === 'exports' &&
          path.node.right.type === 'ObjectExpression'
        ) {
          path.node.right.properties = path.node.right.properties.filter((property) => !isNotPlayFunction(property))
        }
      }
    } satisfies Visitor
  }
}

function isNotPlayFunction (property: ObjectMethod | ObjectProperty | SpreadElement) {
  return (property.type === 'ObjectProperty' && property.key.type === 'Identifier' && property.key.name !== 'play') ||
    (property.type === 'ObjectMethod' && property.key.type === 'Identifier' && property.key.name !== 'play')
}
