import { expect, test } from '@jest/globals'
import {
  detectUnsupportedCsfNext,
  isMixedFactoryError,
  UnsupportedCsfNextError
} from './csf-format'

test('given parsed CSF3 object story stats, then unsupported CSF Next is not detected', () => {
  // Given
  const csf = csfFile()
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
  expect(detectUnsupportedCsfNext(csf, parsed, '/project/src/Button.stories.tsx', [])).toBeUndefined()
})

test('given parsed factory story stats, then unsupported CSF Next detection includes export name', () => {
  // Given
  const csf = csfFile()
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
  const detection = detectUnsupportedCsfNext(csf, parsed, '/project/src/Button.stories.tsx', [])

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

function csfFile () {
  return {
    parse () {
      return {
        _stories: {}
      }
    }
  }
}
