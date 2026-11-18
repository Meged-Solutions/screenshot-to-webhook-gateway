import type { Connector } from '../connectors/types.js'
import { MIN_SECRET_LENGTH } from '../lib/config.js'

export type VarState = 'set' | 'missing' | 'optional'
export type ConnectorState = { id: string; title: string; state: 'ready' | 'incomplete' | 'unused'; missing: string[] }
export type SetupReport = { core: { name: string; state: VarState }[]; connectors: ConnectorState[]; toFill: string[] }

const has = (env: Record<string, string | undefined>, name: string) => {
  const value = env[name]?.trim()
  return !!value && !value.includes('your-project')
}

/**
 * What `npm run setup` reports, from .env.local values (never printed). A
 * connector with none of its required vars set is "unused", so users are only
 * asked for the connectors they started configuring.
 */
export function setupReport(env: Record<string, string | undefined>, connectors: readonly Connector[]): SetupReport {
  const secretOk = (env.WEBHOOK_SIGNING_SECRET?.trim().length ?? 0) >= MIN_SECRET_LENGTH
  const core: SetupReport['core'] = [
    { name: 'WEBHOOK_SIGNING_SECRET', state: secretOk ? 'set' : 'missing' },
    { name: 'REVOKED_TOKEN_IDS', state: has(env, 'REVOKED_TOKEN_IDS') ? 'set' : 'optional' },
    { name: 'WEBHOOK_URL', state: has(env, 'WEBHOOK_URL') ? 'set' : 'missing' },
  ]
  const states = connectors.map((c): ConnectorState => {
    const required = c.env.filter((v) => !v.optional).map((v) => v.name)
    const missing = required.filter((name) => !has(env, name))
    const anySet = c.env.some((v) => has(env, v.name))
    const state = !missing.length ? 'ready' : anySet ? 'incomplete' : 'unused'
    return { id: c.id, title: c.title, state, missing: state === 'incomplete' ? missing : [] }
  })
  const toFill = [...core.filter((v) => v.state === 'missing').map((v) => v.name), ...states.flatMap((c) => c.missing)]
  return { core, connectors: states, toFill }
}
