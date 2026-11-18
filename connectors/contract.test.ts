/// <reference types="vite/client" />
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { describe, expect, it } from 'vitest'
import { runConnectorContract, type ContractSample } from './contract.js'
import { CONNECTORS } from './index.js'

/** Each connector module exports `contractSample` next to its connector. */
const samples = import.meta.glob<{ contractSample: ContractSample }>('./*/index.ts', { eager: true })

describe('registry', () => {
  it('has a contract sample for every registered connector', () => {
    for (const c of CONNECTORS) expect(samples[`./${c.id}/index.ts`]?.contractSample, c.id).toBeDefined()
  })
  it('lists every env var in .env.example, with no value', () => {
    const example = parseEnv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'))
    for (const name of ['WEBHOOK_SIGNING_SECRET', 'REVOKED_TOKEN_IDS', 'WEBHOOK_URL', ...CONNECTORS.flatMap((c) => c.env.map((v) => v.name))]) {
      expect(example, name).toHaveProperty(name, '')
    }
  })
})

for (const connector of CONNECTORS) {
  const sample = samples[`./${connector.id}/index.ts`]?.contractSample
  if (sample) runConnectorContract(connector, sample)
}
