/**
 * Forwards each report to a Zapier "Catch Hook" (Webhooks by Zapier trigger).
 * The ref holds only the two ids of the hook URL, and the URL is rebuilt on
 * the fixed host hooks.zapier.com, so a token can never send data elsewhere.
 * See README.md in this folder.
 */
import { forwardReport } from '../../lib/forward.js'
import type { ContractSample } from '../contract.js'
import { DeliveryError, type Connector } from '../types.js'

/** `<accountId>_<hookId>`: a numeric Zapier user id and an alphanumeric hook code. */
const ZAPIER_REF = /^([1-9][0-9]{0,11})_([A-Za-z0-9]{5,16})$/

export const zapier: Connector = {
  id: 'zapier',
  title: 'Zapier',
  env: [],

  isValidRef: (ref) => ZAPIER_REF.test(ref),

  async deliver(report, ref) {
    const match = ZAPIER_REF.exec(ref)
    if (!match) throw new DeliveryError('Invalid Zapier hook ref')
    const [, accountId, hookId] = match as unknown as [string, string, string]
    const url = `https://hooks.zapier.com/hooks/catch/${encodeURIComponent(accountId)}/${encodeURIComponent(hookId)}/`
    return forwardReport(url, report)
  },
}

/** Used by the shared contract tests. */
export const contractSample: ContractSample = {
  validRef: '1234567_abcdefg',
  invalidRefs: [
    '1234567-abcdefg',
    '1234567abcdefg',
    '1234567_',
    '_abcdefg',
    '1234567_abc_def',
    'abcdefg_1234567',
    'https://hooks.zapier.com/hooks/catch/1234567/abcdefg/',
  ],
}
