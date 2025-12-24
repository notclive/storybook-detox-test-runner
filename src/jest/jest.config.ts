import { type Config } from 'jest'
import { join } from 'path'
import { getDirectories } from '../get-directories'
import { generateTests } from '../test-generator/generate-tests'

const directories = getDirectories()
const { csfsToTest } = generateTests(directories)
const storyPathsAsRegex = csfsToTest.map(literal => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
const testDirGlobBase = directories.testDirectory.replace(/\\/g, '/')

export default {
  preset: 'react-native',
  rootDir: directories.projectRoot,
  transform: {
    [storyPathsAsRegex]: join(__dirname, 'composing-transformer')
  },
  testMatch: [`${testDirGlobBase}/**/*.spec.js`],
  globalSetup: join(__dirname, 'global-setup'),
  globalTeardown: join(__dirname, 'global-teardown'),
  // Detox defaults, see https://wix.github.io/Detox/docs/config/testRunner#jest-config.
  testTimeout: 120000,
  maxWorkers: 1,
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
} satisfies Config
