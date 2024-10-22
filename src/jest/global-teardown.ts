import { globalTeardown } from 'detox/runners/jest'
import { closeChannel } from '../channel'

export default async function () {
  await closeChannel()
  await globalTeardown()
}
