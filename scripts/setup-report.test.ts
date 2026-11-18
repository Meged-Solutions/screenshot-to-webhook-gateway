import { describe, expect, it } from 'vitest'
import type { Connector } from '../connectors/types.js'
import { setupReport } from './setup-report.js'

const connector = (id: string, env: Connector['env']): Connector =>
  ({ id, title: id.toUpperCase(), env, isValidRef: () => true, deliver: async () => ({ id: '', skipped: [] }) }) as Connector
const a = connector('a', [
  { name: 'A_KEY', sensitive: true, scope: 'gateway', description: 'x' },
  { name: 'A_SECRET', sensitive: true, scope: 'gateway', description: 'x', optional: true },
])
const b = connector('b', [{ name: 'B_KEY', sensitive: true, scope: 'gateway', description: 'x' }])
const c = connector('c', [])
const core = { WEBHOOK_SIGNING_SECRET: 's'.repeat(64), WEBHOOK_URL: 'https://gw.example.com/api/webhook' }

describe('setupReport', () => {
  it('treats a connector with nothing set as unused, not missing', () => {
    const r = setupReport(core, [a, b])
    expect(r.connectors).toEqual([
      { id: 'a', title: 'A', state: 'unused', missing: [] },
      { id: 'b', title: 'B', state: 'unused', missing: [] },
    ])
    expect(r.toFill).toEqual([])
  })
  it('asks only for the missing vars of a partly configured connector, ignoring optional ones', () => {
    const r = setupReport({ ...core, A_SECRET: 'x' }, [a, b])
    expect(r.connectors[0]).toEqual({ id: 'a', title: 'A', state: 'incomplete', missing: ['A_KEY'] })
    expect(r.toFill).toEqual(['A_KEY'])
    expect(setupReport({ ...core, A_KEY: 'k' }, [a]).connectors[0]).toMatchObject({ state: 'ready', missing: [] })
  })
  it('marks connectors that need no env as ready', () => {
    expect(setupReport(core, [c]).connectors[0]).toMatchObject({ state: 'ready' })
  })
  it('reports core vars, treats placeholders as missing, and requires the secret to be 32+ characters', () => {
    const r = setupReport({ WEBHOOK_SIGNING_SECRET: 'short', WEBHOOK_URL: 'https://your-project.vercel.app/api/webhook' }, [])
    expect(r.core).toEqual([
      { name: 'WEBHOOK_SIGNING_SECRET', state: 'missing' },
      { name: 'REVOKED_TOKEN_IDS', state: 'optional' },
      { name: 'WEBHOOK_URL', state: 'missing' },
    ])
    expect(r.toFill).toEqual(['WEBHOOK_SIGNING_SECRET', 'WEBHOOK_URL'])
  })
})
