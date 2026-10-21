// Says which csf-tools tests run, which the default reporter does not show.
// They are picked the way loadCsfAdapter picks: by whether the installed
// csf-tools has `parseModule`.
export default async function () {
  const csfTools = await import('storybook/internal/csf-tools')

  console.info(
    typeof csfTools.parseModule === 'function'
      ? '\nTesting csf-estree.ts on the installed Storybook. The csf-babel.ts tests that parse with it are skipped: they need Storybook 9 or 10.'
      : '\nTesting csf-babel.ts on the installed Storybook. The csf-estree.ts tests that parse with it are skipped: they need the csf-tools of Storybook 11 (storybookjs/storybook#36613).'
  )
}
