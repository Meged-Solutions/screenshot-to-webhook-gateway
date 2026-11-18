import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONNECTOR_ID, REF } from '../lib/token.js'
import { CONNECTORS, getConnector } from './index.js'
import { ConfigError, type Connector, type Report } from './types.js'

export type ContractSample = { validRef: string; invalidRefs: string[] }

const report: Report = { fields: { note: 'Button overlaps footer', pageUrl: 'https://example.com' } }

/**
 * The rules every connector must pass. Each connector's own tests call this;
 * connectors/contract.test.ts also runs it for every registered connector.
 */
export function runConnectorContract(connector: Connector, sample: ContractSample, opts: { registered?: boolean } = {}): void {
  describe(`connector contract: ${connector.id}`, () => {
    afterEach(() => vi.unstubAllGlobals())

    it('has a valid id and title', () => {
      expect(connector.id).toMatch(CONNECTOR_ID)
      expect(connector.title.trim()).not.toBe('')
    })

    if (opts.registered ?? true) {
      it('is registered under its id, once', () => {
        expect(getConnector(connector.id)).toBe(connector)
        expect(CONNECTORS.filter((c) => c.id === connector.id)).toHaveLength(1)
      })
    }

    it('accepts its sample ref', () => {
      expect(REF.test(sample.validRef)).toBe(true)
      expect(connector.isValidRef(sample.validRef)).toBe(true)
    })

    it('rejects refs it cannot use, and anything outside REF', () => {
      for (const ref of [...sample.invalidRefs, '', 'a.b', 'x'.repeat(129), 'with space']) {
        expect(connector.isValidRef(ref), ref).toBe(false)
      }
    })

    it('documents its env vars', () => {
      for (const v of connector.env) {
        expect(v.name).toMatch(/^[A-Z][A-Z0-9_]*$/)
        expect(v.description.trim()).not.toBe('')
      }
    })

    const gatewayVars = connector.env.filter((v) => v.scope === 'gateway')
    if (gatewayVars.length) {
      it('fails with ConfigError, before any network call, when its env is missing', async () => {
        vi.stubGlobal('fetch', () => {
          throw new Error('network used before env was checked')
        })
        await expect(connector.deliver(report, sample.validRef, {})).rejects.toBeInstanceOf(ConfigError)
      })
    }
  })
}
