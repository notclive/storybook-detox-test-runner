# Storybook Detox test runner

This project enables you to test your [Storybook for React Native](https://github.com/storybookjs/react-native) stories using [Detox](https://wix.github.io/Detox/).

# Getting started

1. Install and set up [Detox](https://wix.github.io/Detox/)

2. Install `storybook-detox-test-runner`

```sh
yarn add -D storybook-detox-test-runner
```

3. Use `storybook-detox-test-runner` as the base of your Detox configuration

```typescript
  // package.json
  ...
  "detox": {
    "extends": "storybook-detox-test-runner",
    "configurations": ...
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

Give your story a `play` function, using Detox functions like `element` and `by` to find and interact with elements.

```typescript
// counter.stories.tsx
import { type Meta, type StoryObj } from '@storybook/react'
import Counter from 'src/components/counter'

const component: Meta<typeof Counter> = {
  component: Counter
}

export default component

export const WhenIClickOnTheCounterThenTheNumberGoesUp: StoryObj<typeof Counter> = {
  play: async () => {
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
