# Storybook Detox Test Runner

This project enables you to test your [Storybook for React Native](https://github.com/storybookjs/react-native) stories using [Detox](https://wix.github.io/Detox/).

## How it works

The test runner injects itself into your Detox tests by overriding the Jest configuration.
Before the tests run it generates Jest test files for your Storybook story files. Generated spec files are written into `<STORYBOOK_CONFIG_DIR>/.detox-tests`, mirroring the relative path of each story file. This avoids filename collisions when multiple stories share the same basename (for example `index.stories.tsx`).

> [!NOTE]
> The generated Jest test name uses the Storybook `story.id` to ensure uniqueness across different files (for example multiple `Default` stories).

Each test uses Storybook's websockets to render the appropriate story, it then runs your story's `play` function, which may use the Detox API.

# Getting started

1. Install `storybook-detox-test-runner`

```sh
yarn add -D storybook-detox-test-runner
```

2. Ensure that Storybook, running on your app, has websockets enabled

```typescript
// .storybook/index.js
...
const StorybookUIRoot = view.getStorybookUI({
  enableWebsockets: true
})
...
```

> [!NOTE] This is different to the `websockets` property of `withStorybook` in `metro.config.js`
>
> Do not enable the `websockets` property.

3. Install Detox

- Follow Detox's [environment setup](https://wix.github.io/Detox/docs/introduction/environment-setup) and [project setup](https://wix.github.io/Detox/docs/introduction/project-setup)

- Remove the `testRunner` section from the Detox configuration and extend `storybook-detox-test-runner`

```javascript
// .detoxrc.js
/** @type {Detox.DetoxConfig} */
module.exports = {
  extends: 'storybook-detox-test-runner',
  configurations: {
    ...
```

- If you use a flag to toggle Storybook, ensure it's enabled during the build, for example:

```javascript
// .detoxrc.js
  ...
  "app": {
    "type": "android.apk",
    "build": "cd android && STORYBOOK=true ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release",
    "binaryPath": "android/app/build/outputs/apk/release/app-release.apk"
  }
  ...
```

4. Add `.storybook/.detox-tests` to your `.gitignore`

The test runner generates tests in your Storybook config directory, these don't need to be committed to source control.

> [!NOTE] This assumes your Storybook config directory is `.storybook`
>
> If you use a different directory, declare the environment variable `STORYBOOK_CONFIG_DIR` when running the tests.
>
> ```sh
> STORYBOOK_CONFIG_DIR=custom-dir yarn detox test
> ```

5. Build your test app with `yarn detox build`

## Writing a test

Give your story a `play` function, access Detox functions like `element` and `by` from the `detox` argument to find and interact with elements.

```typescript
// counter.stories.tsx
import { type Meta } from '@storybook/react-native'
import type { DetoxStoryObj } from 'storybook-detox-test-runner/types'
import Counter from 'src/components/counter'

export default {
  component: Counter
} satisfies Meta<typeof Counter>

export const WhenIClickOnTheCounterThenTheNumberGoesUp: DetoxStoryObj<typeof Counter> = {
  play: async ({ detox: { by, element, waitFor } }) => {
    // Wait for initial render.
    await waitFor(element(by.text(/Count up/))).toBeVisible().withTimeout(1000)

    // When
    await element(by.text(/Count up/)).tap()
    await element(by.text(/Count up/)).tap()
    await element(by.text(/Count up/)).tap()
    await element(by.text(/Count up/)).tap()
    await element(by.text(/Count up/)).tap()

    // Then
    await waitFor(element(by.text(/5/))).toBeVisible()
  }
}
```

# Running the test

Run Detox as normal with `yarn detox test`

# Per-test configuration

You can trigger advanced behaviour for individual tests by adding a `detox` property to the story.

```typescript
// counter.stories.tsx
...

export const WhenIClickOnTheCounterThenTheNumberGoesUp: DetoxStoryObj<typeof Counter> = {
  detox: {
    onlyOnOperatingSystems: ['ios'] // Only run the test on iOS.
    launch: { // Arguments passed to Detox's `device.launchApp`.
      permissions: {
        location: 'inuse'
      }
    }
  },
  play: async ({ detox }) => {
    ...
  }
}
```

# Environment variables

| Variable                            | Default      | Description                                                                     |
| ----------------------------------- | ------------ | ------------------------------------------------------------------------------- |
| `STORYBOOK_CONFIG_DIR`              | `.storybook` | Storybook config directory. Generated tests are written to `<dir>/.detox-tests` |
| `STORYBOOK_WS_PORT`                 | `7007`       | WebSocket server port for communication between test runner and device          |
| `STORYBOOK_WS_CONNECT_TIMEOUT_MS`   | `60000`      | Timeout (ms) waiting for device to connect. Increase if app startup is slow     |
| `STORYBOOK_CHANGE_STORY_TIMEOUT_MS` | `20000`      | Timeout (ms) waiting for story to render after switching                        |
| `STORYBOOK_CHANNEL_DEBUG`           | -            | Set to `1` to enable debug logging for WebSocket channel                        |
