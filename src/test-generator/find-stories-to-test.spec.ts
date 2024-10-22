import { afterEach, expect, test } from '@jest/globals'
import mockFilesystem from 'mock-fs'
import { findStoriesToTest } from './find-stories-to-test'

afterEach(() => {
  mockFilesystem.restore()
})

test('given files match pattern, then they are found', () => {
  // Given
  mockFilesystem({
    '/users/foo/projects/bar/src/folder/not-a-story.ts': '',
    '/users/foo/projects/bar/src/folder/file-to-test.stories.ts': '',
    '/users/foo/projects/bar/src/folder/subfolder/another-file-to-test.stories.tsx': ''
  })

  // When
  const storiesToTest = findStoriesToTest(
    ['../src/**/*.stories.?(ts|tsx|js|jsx)'],
    { storybookConfigDirectory: '/users/foo/projects/bar/.storybook', projectRoot: '/users/foo/projects/bar' }
  )

  // Then
  expect(storiesToTest).toEqual([
    '/users/foo/projects/bar/src/folder/file-to-test.stories.ts',
    '/users/foo/projects/bar/src/folder/subfolder/another-file-to-test.stories.tsx'
  ])
})

test('given file matches multiple patterns, then it is only found once', () => {
  // Given
  mockFilesystem({ '/users/foo/projects/bar/src/folder/file-to-test.stories.ts': '' })

  // When
  const storiesToTest = findStoriesToTest(
    ['../src/**/*.stories.?(ts|tsx|js|jsx)', '../src/folder/file-to-test.stories.ts'],
    { storybookConfigDirectory: '/users/foo/projects/bar/.storybook', projectRoot: '/users/foo/projects/bar' }
  )

  // Then
  expect(storiesToTest).toEqual([
    '/users/foo/projects/bar/src/folder/file-to-test.stories.ts'
  ])
})

test('given file matches pattern but not relative to storybook config directory, then it is not found', () => {
  // Given
  mockFilesystem({
    '/users/foo/projects/bar/src/folder/file-to-test.stories.ts': '',
    '/users/foo/projects/another-project/src/folder/file-to-test-from-another-project.stories.ts': ''
  })

  // When
  const storiesToTest = findStoriesToTest(
    ['../src/folder/*.stories.ts'],
    { storybookConfigDirectory: '/users/foo/projects/bar/.storybook', projectRoot: '/users/foo/projects/bar' }
  )

  // Then
  expect(storiesToTest).toEqual([
    '/users/foo/projects/bar/src/folder/file-to-test.stories.ts'
  ])
})
