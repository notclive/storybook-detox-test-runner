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
          path.node.right.properties = path.node.right.properties.filter((property) => isNecessaryPartOfStory(property))
        }
      }
    } satisfies Visitor
  }
}

function isNecessaryPartOfStory (property: ObjectMethod | ObjectProperty | SpreadElement) {
  // May or may not be necessary, I don't know.
  if (property.type === 'SpreadElement') {
    return true
  }
  return property.key.type === 'Identifier' && ['play', 'detox'].includes(property.key.name)
}
