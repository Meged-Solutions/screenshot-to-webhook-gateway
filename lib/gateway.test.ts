import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigError, DeliveryError, type Connector } from '../connectors/types.js'
import { loadConfig } from './config.js'
import { issueToken } from './token.js'

const SECRET = 'a'.repeat(32)
const deliver = vi.fn<Connector['deliver']>()
const legacy = vi.fn<NonNullable<Connector['verifyLegacy']>>()

vi.mock('../connectors/index.js', () => {
  const fake: Connector = { id: 'fake', title: 'Fake', env: [], isValidRef: (r) => /^d[0-9]+$/.test(r), deliver, verifyLegacy: legacy }
  return { CONNECTORS: [fake], getConnector: (id: string) => (id === 'fake' ? fake : undefined) }
})
const { POST } = await import('../api/webhook.js')

const post = (token: string | undefined, body: unknown = { note: 'hi' }) =>
  POST(
    new Request('http://x/api/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    }),
  )
const tokenFor = (connector = 'fake', ref = 'd1') => issueToken(connector, ref, SECRET)

beforeEach(() => {
  vi.stubEnv('WEBHOOK_SIGNING_SECRET', SECRET)
  vi.stubEnv('REVOKED_TOKEN_IDS', '')
  deliver.mockReset().mockResolvedValue({ id: 'rec1', skipped: [] })
  legacy.mockReset().mockReturnValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/webhook', () => {
  it('delivers to the connector and ref named in the token', async () => {
    const res = await post(tokenFor().token)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, id: 'rec1' })
    expect(deliver).toHaveBeenCalledWith({ fields: { note: 'hi' }, image: undefined }, 'd1', process.env)
  })
  it('lists skipped fields', async () => {
    deliver.mockResolvedValue({ id: 'rec1', skipped: ['Tag'] })
    expect(await (await post(tokenFor().token)).json()).toEqual({ ok: true, id: 'rec1', skipped: ['Tag'] })
  })
  it('answers 401 to a missing, forged or revoked token', async () => {
    expect((await post(undefined)).status).toBe(401)
    expect((await post('nope')).status).toBe(401)
    expect((await post(tokenFor().token.slice(0, -1) + 'x')).status).toBe(401)
    const { token, id } = tokenFor()
    vi.stubEnv('REVOKED_TOKEN_IDS', `other, ${id}`)
    expect((await post(token)).status).toBe(401)
    expect(deliver).not.toHaveBeenCalled()
  })
  it('unknown connector is 401', async () => {
    expect((await post(tokenFor('notion', 'd1').token)).status).toBe(401)
  })
  it('a ref the connector does not accept is 401', async () => {
    expect((await post(tokenFor('fake', 'x1').token)).status).toBe(401)
  })
  it('accepts a token the connector verifies as legacy', async () => {
    legacy.mockReturnValue({ ref: 'd7', id: 'old' })
    expect((await post('LEGACYTOKEN')).status).toBe(200)
    expect(deliver.mock.calls[0]?.[1]).toBe('d7')
  })
  it('a legacy id in REVOKED_TOKEN_IDS is passed to the connector', async () => {
    vi.stubEnv('REVOKED_TOKEN_IDS', 'old')
    await post('LEGACYTOKEN')
    expect([...(legacy.mock.calls[0]?.[2] ?? [])]).toEqual(['old'])
  })
  it('missing connector env is 500 only for that connector', async () => {
    deliver.mockRejectedValue(new ConfigError('Missing AIRTABLE_PAT'))
    const res = await post(tokenFor().token)
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ ok: false, error: 'Server is not configured' })
    expect(text).not.toContain('AIRTABLE_PAT')
  })
  it('answers 400 to a bad body', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor().token}` }, body: '{' }))
    expect(res.status).toBe(400)
  })
  it('answers 502 with the id when part of the report was saved', async () => {
    deliver.mockRejectedValue(new DeliveryError('upload failed', 'rec1'))
    const res = await post(tokenFor().token)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, id: 'rec1', error: 'Delivery failed' })
  })
  it('answers 502 without leaking the message for any other error', async () => {
    deliver.mockRejectedValue(new Error('secret internals'))
    const res = await post(tokenFor().token)
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('secret internals')
  })
  it('answers 500 when the signing secret is missing', async () => {
    vi.stubEnv('WEBHOOK_SIGNING_SECRET', '')
    expect((await post(tokenFor().token)).status).toBe(500)
  })
})

describe('config', () => {
  it('parses revoked ids and enforces secret length', () => {
    expect([...loadConfig({ WEBHOOK_SIGNING_SECRET: SECRET, REVOKED_TOKEN_IDS: 'a, b,' }).revokedIds]).toEqual(['a', 'b'])
    expect(() => loadConfig({ WEBHOOK_SIGNING_SECRET: 'short' })).toThrow('32')
  })
  it('needs no connector env', () => {
    expect(loadConfig({ WEBHOOK_SIGNING_SECRET: SECRET }).signingSecret).toBe(SECRET)
  })
})
