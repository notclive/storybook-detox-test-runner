import { expect, test } from '@jest/globals'
import type { DetoxStoryObj } from './types'

type ButtonProps = {
  label: string
}

function Button (_props: ButtonProps) {
  return null
}

const Primary = {
  args: {
    label: 'Primary'
  },
  detox: {
    onlyOnOperatingSystems: ['ios'],
    launch: {
      newInstance: true
    }
  },
  play ({ detox }) {
    void detox
  }
} satisfies DetoxStoryObj<typeof Button>

test('DetoxStoryObj supports detox metadata and play context', () => {
  expect(Primary.detox.onlyOnOperatingSystems).toEqual(['ios'])
})
