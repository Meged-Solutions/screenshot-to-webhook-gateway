/**
 * A copy-me connector: it forwards each report as JSON to
 * TEMPLATE_URL/<ref>, using the shared helper in lib/forward.ts (timeout, no
 * redirects, status-only errors). It is not registered, so the gateway never
 * uses it. See README.md in this folder for how to turn it into a real
 * connector. A connector that calls an API directly (like connectors/github)
 * should keep the same guarantees: a timeout, redirect: 'error', and errors
 * that never echo response bodies or secrets.
 */
import { forwardReport } from '../../lib/forward.js'
import type { ContractSample } from '../contract.js'
import { DeliveryError, requireEnv, type Connector } from '../types.js'

const REF = /^[a-z0-9-]{1,64}$/

export const template: Connector = {
  id: 'template',
  title: 'Template',
  env: [{ name: 'TEMPLATE_URL', sensitive: false, description: 'Base URL reports are forwarded to, followed by the ref', scope: 'gateway' }],

  // The destination ref travels inside the token. Keep it short and validate it strictly.
  isValidRef: (ref) => REF.test(ref),

  async deliver(report, ref, env) {
    const base = requireEnv(env, 'TEMPLATE_URL') // check env before any network call
    if (!REF.test(ref)) throw new DeliveryError('Invalid destination') // re-check: never trust the caller
    return forwardReport(`${base.replace(/\/+$/, '')}/${encodeURIComponent(ref)}`, report)
  },
}

/** Used by the shared contract tests. */
export const contractSample: ContractSample = { validRef: 'inbox', invalidRefs: ['Inbox', 'in_box'] }
