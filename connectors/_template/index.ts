/**
 * A copy-me connector: it forwards each report as JSON to the URL in
 * TEMPLATE_URL. It is not registered, so the gateway never uses it.
 * See README.md in this folder for how to turn it into a real connector.
 */
import type { ContractSample } from '../contract.js'
import { DeliveryError, requireEnv, type Connector } from '../types.js'

export const template: Connector = {
  id: 'template',
  title: 'Template (forwards JSON to a URL)',
  env: [{ name: 'TEMPLATE_URL', sensitive: false, description: 'Where reports are forwarded', scope: 'gateway' }],

  // The destination ref travels inside the token. Keep it short and validate it strictly.
  isValidRef: (ref) => /^[a-z0-9-]{1,64}$/.test(ref),

  async deliver(report, ref, env) {
    const url = requireEnv(env, 'TEMPLATE_URL') // check env before any network call
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination: ref, fields: report.fields }),
    })
    if (!res.ok) throw new DeliveryError(`Forward failed (${res.status})`)
    const body = (await res.json().catch(() => ({}))) as { id?: unknown }
    return { id: typeof body.id === 'string' ? body.id : '', skipped: [] }
  },
}

/** Used by the shared contract tests. */
export const contractSample: ContractSample = { validRef: 'inbox', invalidRefs: ['Inbox', 'in_box'] }
