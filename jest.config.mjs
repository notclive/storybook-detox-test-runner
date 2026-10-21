export default {
  testEnvironment: 'node',
  globalSetup: './jest.global-setup.mjs',
  transform: {
    '^.+.tsx?$': 'ts-jest'
  }
}
