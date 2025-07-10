import { expect, test } from '@jest/globals'
import composingTransformer from './composing-transformer'

test('given default export is object, then default export is removed', () => {
  // When
  const transformed = composingTransformer.process(`
      exports.default = {
        args: {
          height: 200
        },
        parameters: {
          backgrounds: {
            default: 'dark'
          }
        }
      }

      exports.MyStory = {
        play: function () {
          console.log('This function should remain')
        }
      }
  `, 'ficticious-file.tsx', {
    config: {
      cwd: '/',
    },
  } as never)

  // Then
  expect(stripSourceMap(transformed?.code)).toMatchInlineSnapshot(`
"exports.default = {};
exports.MyStory = {
  play: function () {
    console.log('This function should remain');
  }
};
"
`)
})

test('given exports with properties used by storybook, then properties other than play and detox are removed', () => {
  // When
  const transformed = composingTransformer.process(`
    exports.MyStory = {
      args: {
        height: 200
      },
      detox: {
        onlyOnOperatingSystems: ['ios']
      },
      parameters: {
        backgrounds: {
          default: 'dark'
        }
      },
      play: function () {
        console.log('This function should remain')
      }
    }

    exports.MyOtherStory = {
      args: {
        height: 200
      },
      detox: {
        launch: {
          permissions: {
            location: 'never'
          }
        }
      },
      parameters: {
        backgrounds: {
          default: 'dark'
        }
      },
      play: function () {
        console.log('This function should also remain')
      }
    }
    `, 'ficticious-file.tsx', {
      config: {
        cwd: '/',
      },
    } as never)

    // Then
    expect(stripSourceMap(transformed?.code)).toMatchInlineSnapshot(`
"exports.MyStory = {
  detox: {
    onlyOnOperatingSystems: ['ios']
  },
  play: function () {
    console.log('This function should remain');
  }
};
exports.MyOtherStory = {
  detox: {
    launch: {
      permissions: {
        location: 'never'
      }
    }
  },
  play: function () {
    console.log('This function should also remain');
  }
};
"
`)
})

test('given `require` used by stripped function, then `require` is stripped too', () => {
  // When
  const transformed = composingTransformer.process(`
    var ReactNative = require('react-native')

    exports.MyStory = {
      render: function () {
        return React.createElement(ReactNative.Text, null, 'This should be removed along with the import')
      },
      play: function () {
        console.log('This function should remain')
      }
    }
    `, 'ficticious-file.tsx', {
      config: {
        cwd: '/',
      },
    } as never)

    // Then
    expect(stripSourceMap(transformed?.code)).toMatchInlineSnapshot(`
"exports.MyStory = {
  play: function () {
    console.log('This function should remain');
  }
};
"
`)
})

function stripSourceMap(source: string) {
  return source.replace(/^\/\/# sourceMappingURL=.+$/m, '')
}