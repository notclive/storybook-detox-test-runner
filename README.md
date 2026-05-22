# Storybook Detox Test Runner

This project enables you to test your [Storybook for React Native](https://github.com/storybookjs/react-native) stories using [Detox](https://wix.github.io/Detox/).

## How it works

The test runner injects itself into your Detox tests by overriding the Jest configuration.
Before the tests run it generates Jest test files for your Storybook story files. Generated spec files are written into the selected Storybook config directory under `.detox-tests`, mirroring the relative path of each story file. This avoids filename collisions when multiple stories share the same basename (for example `index.stories.tsx`).

> [!NOTE]
> The generated Jest test name uses the Storybook `story.id` to ensure uniqueness across different files (for example multiple `Default` stories).

Each test uses the Storybook WebSocket channel to render the appropriate story, then runs your story's `play` function, which may use the Detox API.

# Compatibility

- Storybook 9 and 10 are supported.
- TypeScript users need TypeScript 5.3 or newer because the public types use `resolution-mode` import attributes for Storybook ESM types.

# Getting started

1. Install `storybook-detox-test-runner`

```sh
yarn add -D storybook-detox-test-runner
```

2. Configure React Native Storybook

React Native Storybook 9 and 10 use `.rnstorybook` by default. Existing `.storybook` directories continue to work, but new React Native Storybook projects should use `.rnstorybook`.

```typescript
// .rnstorybook/main.ts
import type { StorybookConfig } from "@storybook/react-native";

const main: StorybookConfig = {
  stories: ["../src/**/*.stories.?(ts|tsx|js|jsx)"],
  deviceAddons: [
    "@storybook/addon-ondevice-controls",
    "@storybook/addon-ondevice-actions",
  ],
};

export default main;
```

```typescript
// .rnstorybook/index.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { view } from "./storybook.requires";

const StorybookUIRoot = view.getStorybookUI({
  enableWebsockets: true,
  host: Platform.OS === "android" ? "127.0.0.1" : "localhost",
  port: 7007,
  storage: {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
  },
});

export default StorybookUIRoot;
```

If you change `STORYBOOK_WS_PORT`, use the same value here.

```javascript
// metro.config.js
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const {
  withStorybook,
} = require("@storybook/react-native/metro/withStorybook");

const config = {};

module.exports = withStorybook(
  mergeConfig(getDefaultConfig(__dirname), config),
  {
    configPath: "./.rnstorybook",
  }
);
```

Do not set `websockets: 'auto'` in `withStorybook` for runner tests. That starts React Native Storybook's own channel server, usually on port `7007`, while this runner already owns that server.

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

4. Add the generated test directories to your `.gitignore`

```gitignore
.rnstorybook/.detox-tests
.storybook/.detox-tests
```

The test runner generates tests in your Storybook config directory, these don't need to be committed to source control.

When `STORYBOOK_CONFIG_DIR` is not set, the runner looks for `.rnstorybook`, then `.storybook`. If neither directory exists, it uses `.rnstorybook` as the default location. You can force a legacy/custom directory when running tests:

```sh
STORYBOOK_CONFIG_DIR=.storybook yarn detox test
```

5. Build your test app with `yarn detox build`

## WebSocket mode

The supported mode today is a runner-owned WebSocket channel:

1. Jest starts the runner WebSocket server on `STORYBOOK_WS_PORT`, default `7007`.
2. The Storybook UI in the app connects to that server through `getStorybookUI({ enableWebsockets: true, host, port })`.
3. Detox tests ask the runner to switch stories over that connection.

React Native Storybook 10 also has `withStorybook({ websockets })`, but that is a separate channel server mode. If you use it during runner tests, it must not compete with the runner for the same port.

## Writing a test

Give your story a `play` function, access Detox functions like `element` and `by` from the `detox` argument to find and interact with elements.

```typescript
// counter.stories.tsx
import { type Meta } from "@storybook/react-native";
import type { DetoxStoryObj } from "storybook-detox-test-runner/types";
import Counter from "src/components/counter";

export default {
  component: Counter,
} satisfies Meta<typeof Counter>;

export const WhenIClickOnTheCounterThenTheNumberGoesUp: DetoxStoryObj<
  typeof Counter
> = {
  play: async ({ detox: { by, element, waitFor } }) => {
    // Wait for initial render.
    await waitFor(element(by.text(/Count up/)))
      .toBeVisible()
      .withTimeout(1000);

    // When
    await element(by.text(/Count up/)).tap();
    await element(by.text(/Count up/)).tap();
    await element(by.text(/Count up/)).tap();
    await element(by.text(/Count up/)).tap();
    await element(by.text(/Count up/)).tap();

    // Then
    await waitFor(element(by.text(/5/))).toBeVisible();
  },
};
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

| Variable                            | Default                             | Description                                                                               |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `STORYBOOK_CONFIG_DIR`              | autodetect, fallback `.rnstorybook` | Storybook config directory. Generated tests are written to `<dir>/.detox-tests`.          |
| `STORYBOOK_WS_PORT`                 | `7007`                              | Runner WebSocket server port. Keep this in sync with `getStorybookUI({ port })`.          |
| `STORYBOOK_WS_CONNECT_TIMEOUT_MS`   | `60000`                             | Timeout (ms) waiting for the app/device to connect. Increase this if app startup is slow. |
| `STORYBOOK_CHANGE_STORY_TIMEOUT_MS` | `20000`                             | Timeout (ms) waiting for a story to finish rendering after a story switch.                |
| `STORYBOOK_CHANNEL_DEBUG`           | -                                   | Set to `1` to log WebSocket channel events.                                               |

# Troubleshooting

| Problem | Check |
| ------- | ----- |
| Port `7007` is already in use | Stop the other server, or change both `STORYBOOK_WS_PORT` and `getStorybookUI({ port })`. Also check that React Native Storybook is not starting its own channel server through `withStorybook({ websockets: 'auto' })`. |
| Android cannot connect | The runner calls `device.reverseTcpPort(STORYBOOK_WS_PORT)`. Keep the app port equal to `STORYBOOK_WS_PORT`; `127.0.0.1` is usually the right Android host for Detox. |
| Wrong config directory | RN Storybook 9+ defaults to `.rnstorybook`. Use `STORYBOOK_CONFIG_DIR=.storybook` only for legacy/custom projects. |
