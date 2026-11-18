/**
 * Make (formerly Integromat): forwards each report to a scenario's Custom
 * webhook. The ref is `<zone>_<webhook token>`, and the URL is always rebuilt
 * on https://hook.<zone>.make.com, so a ref can never point at another host.
 * See README.md in this folder.
 */
import { forwardReport } from '../../lib/forward.js'
import type { ContractSample } from '../contract.js'
import { DeliveryError, type Connector } from '../types.js'

/** Make's production zones that serve webhooks on hook.<zone>.make.com. */
const ZONES = ['eu1', 'eu2', 'us1', 'us2'] as const

/** `<zone>_<token>`: the token is the 32 lowercase letters and digits after the host in a Make webhook URL. */
const MAKE_REF = new RegExp(`^(${ZONES.join('|')})_([a-z0-9]{32})$`)

function webhookUrl(ref: string): string {
  const [, zone, token] = MAKE_REF.exec(ref) ?? []
  if (!zone || !token) throw new DeliveryError('Invalid Make webhook ref')
  return `https://hook.${zone}.make.com/${encodeURIComponent(token)}`
}

export const make: Connector = {
  id: 'make',
  title: 'Make',
  env: [],
  isValidRef: (ref) => MAKE_REF.test(ref),
  async deliver(report, ref) {
    return forwardReport(webhookUrl(ref), report)
  },
}

/** Used by the shared contract tests. */
export const contractSample: ContractSample = {
  validRef: 'eu1_abcdefghij0123456789klmnopqrstuv',
  invalidRefs: [
    'eu3_abcdefghij0123456789klmnopqrstuv', // unknown zone
    'abcdefghij0123456789klmnopqrstuv', // missing zone
    'eu1_', // missing token
    'eu1_abcdefghij0123456789klmnopqrst', // token too short
    'eu1_ABCDEFGHIJ0123456789KLMNOPQRSTUV', // uppercase token
    'https://hook.eu1.make.com/abcdefghij0123456789klmnopqrstuv', // URL pasted as ref
    'example.com_abcdefghij0123456789klmnopqrstuv', // host in place of zone
  ],
}
