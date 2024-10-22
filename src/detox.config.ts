import { join } from 'path'

// Detox doesn't seem to like the `exports.default = ` style.
module.exports = {
  testRunner: {
    args: {
      config: join(__dirname, 'jest', 'jest.config.js')
    }
  }
}
