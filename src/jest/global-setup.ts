import { globalSetup } from 'detox/runners/jest'
import { prepareChannel } from '../channel'

export default async function () {
  await globalSetup()
  await prepareChannel()
}
