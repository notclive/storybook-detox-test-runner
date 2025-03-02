import { TransformOptions } from '@babel/core'
import { SyncTransformer } from "@jest/transform"
import { createTransformer } from 'babel-jest'
import { join } from 'path'

// The intention behind these two plugins is to remove imports of React Native libraries.
// As the tests will not run in a React Native context.
const playFunctionTransformer = createTransformer({
  plugins: [join(__dirname, 'isolate-play-functions')]
}) as SyncTransformer<TransformOptions>

const deadCodeTransformer = createTransformer({
  plugins: [join(__dirname, 'remove-dead-requires')]
}) as SyncTransformer<TransformOptions>

// A jest transform with multiple plugins will execute those plugins in parallel.
// So if we used a single transform, then the remove-dead-requires plugin would not see the dead code created by the isolate-play-functions plugin.
// To work around this, we compose multiple transforms.
export default {
  process (sourceText, sourcePath, options) {
    const isolatedPlayFunctions = playFunctionTransformer.process(sourceText, sourcePath, options)
    return deadCodeTransformer.process(isolatedPlayFunctions.code, sourcePath, options)
  }
} satisfies SyncTransformer<TransformOptions>
