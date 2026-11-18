import { afterEach, describe, expect, it, vi } from 'vitest'
import { runConnectorContract } from '../contract.js'
import { contractSample, template } from './index.js'

runConnectorContract(template, contractSample, { registered: false })

describe('template connector', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts the report as JSON to TEMPLATE_URL', async () => {
    const fetch = vi.fn(async () => Response.json({ id: 'r1' }))
    vi.stubGlobal('fetch', fetch)
    const result = await template.deliver({ fields: { note: 'hi' } }, 'inbox', { TEMPLATE_URL: 'https://example.com/hook' })
    expect(result).toEqual({ id: 'r1', skipped: [] })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.com/hook')
    expect(JSON.parse(init.body as string)).toEqual({ destination: 'inbox', fields: { note: 'hi' } })
  })
})
