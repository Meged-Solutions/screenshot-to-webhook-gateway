import { afterEach, describe, expect, it, vi } from 'vitest'
import { runConnectorContract } from '../contract.js'
import { ConfigError, DeliveryError, type Report } from '../types.js'
import { contractSample, n8n } from './index.js'

runConnectorContract(n8n, contractSample)

const report: Report = { fields: { note: 'Button overlaps footer' } }
const PATH = '0b6c1f9e-3d2a-4c8b-9e7f-5a1d2c3b4e6f'

function stubFetch(status = 200) {
  const fetch = vi.fn(async () => new Response('{}', { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const call = (fetch: ReturnType<typeof stubFetch>) => fetch.mock.calls[0] as unknown as [string, RequestInit]

describe('n8n connector', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the shared forward payload to <base>/webhook/<ref>', async () => {
    const fetch = stubFetch()
    const result = await n8n.deliver(report, PATH, { N8N_BASE_URL: 'https://n8n.example.com' })
    const [url, init] = call(fetch)
    expect(url).toBe(`https://n8n.example.com/webhook/${PATH}`)
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ source: 'screenshot-to-webhook-gateway', report: report.fields, image: null })
    expect(result).toEqual({ id: body.deliveryId, skipped: [] })
  })

  it('strips trailing slashes and keeps a sub-path of the base URL', async () => {
    const fetch = stubFetch()
    await n8n.deliver(report, 'bug-reports', { N8N_BASE_URL: ' https://example.com/n8n/ ' })
    expect(call(fetch)[0]).toBe('https://example.com/n8n/webhook/bug-reports')
  })

  it('allows plain http only for localhost', async () => {
    const fetch = stubFetch()
    await n8n.deliver(report, 'local', { N8N_BASE_URL: 'http://localhost:5678' })
    await n8n.deliver(report, 'local', { N8N_BASE_URL: 'http://127.0.0.1:5678/' })
    expect(fetch.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      'http://localhost:5678/webhook/local',
      'http://127.0.0.1:5678/webhook/local',
    ])
  })

  it('sends N8N_WEBHOOK_SECRET as X-Webhook-Secret only when set', async () => {
    const fetch = stubFetch()
    await n8n.deliver(report, PATH, { N8N_BASE_URL: 'https://n8n.example.com', N8N_WEBHOOK_SECRET: 's3cret' })
    await n8n.deliver(report, PATH, { N8N_BASE_URL: 'https://n8n.example.com', N8N_WEBHOOK_SECRET: '  ' })
    await n8n.deliver(report, PATH, { N8N_BASE_URL: 'https://n8n.example.com' })
    const headers = fetch.mock.calls.map((c) => new Headers((c as unknown as [string, RequestInit])[1].headers))
    expect(headers[0]!.get('X-Webhook-Secret')).toBe('s3cret')
    expect(headers[1]!.has('X-Webhook-Secret')).toBe(false)
    expect(headers[2]!.has('X-Webhook-Secret')).toBe(false)
  })

  it.each([
    ['missing', undefined],
    ['not a URL', 'n8n.example.com'],
    ['http on a public host', 'http://n8n.example.com'],
    ['another scheme', 'ftp://n8n.example.com'],
    ['a query string', 'https://n8n.example.com/?a=1'],
    ['an empty query string', 'https://n8n.example.com/?'],
    ['a fragment', 'https://n8n.example.com/#x'],
    ['credentials', 'https://user:pass@n8n.example.com'],
    ['the webhook path already in it', 'https://n8n.example.com/webhook'],
  ])('throws ConfigError, before any network call, when N8N_BASE_URL is %s', async (_, value) => {
    const fetch = stubFetch()
    const env = value === undefined ? {} : { N8N_BASE_URL: value }
    await expect(n8n.deliver(report, PATH, env)).rejects.toBeInstanceOf(ConfigError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not leak the base URL value into the ConfigError message', async () => {
    stubFetch()
    await expect(n8n.deliver(report, PATH, { N8N_BASE_URL: 'https://user:hunter2@n8n.example.com' })).rejects.toThrow(
      /^(?!.*hunter2).*N8N_BASE_URL/,
    )
  })

  it('throws DeliveryError when n8n refuses the report (inactive workflow, wrong path, failed header auth)', async () => {
    for (const status of [403, 404, 500]) {
      stubFetch(status)
      await expect(n8n.deliver(report, PATH, { N8N_BASE_URL: 'https://n8n.example.com' })).rejects.toBeInstanceOf(DeliveryError)
    }
  })

  it('accepts webhook paths n8n generates or users type, and nothing else', () => {
    for (const ref of [PATH, 'bug-reports', 'Feedback_2026', 'a', 'x'.repeat(128)]) expect(n8n.isValidRef(ref), ref).toBe(true)
    for (const ref of ['team/bugs', '/bugs', 'bugs/', ':id', 'bugs?x=1', 'https://n8n.example.com/webhook/abc', '%2Fbugs', 'x'.repeat(129)]) {
      expect(n8n.isValidRef(ref), ref).toBe(false)
    }
  })

  it('marks the secret optional and sensitive, and the base URL required', () => {
    const byName = Object.fromEntries(n8n.env.map((v) => [v.name, v]))
    expect(byName.N8N_BASE_URL).toMatchObject({ scope: 'gateway', sensitive: false })
    expect(byName.N8N_BASE_URL?.optional).toBeFalsy()
    expect(byName.N8N_WEBHOOK_SECRET).toMatchObject({ scope: 'gateway', sensitive: true, optional: true })
  })
})
