import { type Config } from 'jest'
import { join } from 'path'
import { getDirectories } from '../get-directories'
import { generateTests } from '../test-generator/generate-tests'

const directories = getDirectories()
generateTests(directories)

export default {
  preset: 'react-native',
  rootDir: directories.projectRoot,
  testMatch: [`${directories.testDirectory}/*.spec.js`],
  globalSetup: join(__dirname, 'global-setup'),
  globalTeardown: join(__dirname, 'global-teardown'),
  // Detox defaults, see https://wix.github.io/Detox/docs/config/testRunner#jest-config.
  testTimeout: 120000,
  maxWorkers: 1,
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
} satisfies Config
