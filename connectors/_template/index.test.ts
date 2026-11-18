import { afterEach, describe, expect, it, vi } from 'vitest'
import { runConnectorContract } from '../contract.js'
import { contractSample, template } from './index.js'

runConnectorContract(template, contractSample, { registered: false })

describe('template connector', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('forwards the report with the shared helper to TEMPLATE_URL/<ref>', async () => {
    const fetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetch)
    const result = await template.deliver({ fields: { note: 'hi' } }, 'inbox', { TEMPLATE_URL: 'https://example.com/hooks/' })
    expect(result.id).toMatch(/^dlv_/)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.com/hooks/inbox')
    expect(init.redirect).toBe('error')
    expect(JSON.parse(init.body as string)).toMatchObject({ report: { note: 'hi' }, image: null })
  })
})
