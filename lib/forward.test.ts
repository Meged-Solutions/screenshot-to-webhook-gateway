import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeliveryError } from '../connectors/types.js'
import { forwardReport } from './forward.js'

const image = { base64: 'aGk=', mimeType: 'image/png', fileName: 'screenshot.png' }

describe('forwardReport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts one JSON shape and returns its own delivery id', async () => {
    const fetch = vi.fn(async () => new Response('Accepted', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const result = await forwardReport('https://hooks.example.com/abc', { fields: { note: 'Broken', tag: 'Bug' }, image })
    expect(result.skipped).toEqual([])
    expect(result.id).toMatch(/^dlv_[0-9a-f-]{36}$/)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://hooks.example.com/abc')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
    const headers = new Headers(init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-delivery-id')).toBe(result.id)
    expect(JSON.parse(init.body as string)).toEqual({
      deliveryId: result.id,
      source: 'screenshot-to-webhook-gateway',
      report: { note: 'Broken', tag: 'Bug' },
      image: { mimeType: 'image/png', fileName: 'screenshot.png', base64: 'aGk=' },
    })
  })

  it('sends image null when there is no screenshot', async () => {
    const fetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetch)
    await forwardReport('https://hooks.example.com/abc', { fields: {} })
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).image).toBeNull()
  })

  it('adds extra headers without letting them replace the content type or delivery id', async () => {
    const fetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetch)
    await forwardReport('https://hooks.example.com/abc', { fields: {} }, { headers: { Authorization: 'Bearer x', 'Content-Type': 'text/plain' } })
    const headers = new Headers((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers)
    expect(headers.get('authorization')).toBe('Bearer x')
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('throws DeliveryError with the status, never the response body, when refused', async () => {
    vi.stubGlobal('fetch', async () => new Response('secret internals', { status: 410 }))
    const err = await forwardReport('https://hooks.example.com/abc', { fields: {} }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DeliveryError)
    expect((err as Error).message).toBe('Webhook refused the report (410)')
  })

  it('throws DeliveryError on a network failure or timeout', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(forwardReport('https://hooks.example.com/abc', { fields: {} })).rejects.toBeInstanceOf(DeliveryError)
  })

  it('turns an invalid header value into a DeliveryError that never contains the value', async () => {
    const fetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetch)
    const err = await forwardReport('https://hooks.example.com/abc', { fields: {} }, { headers: { 'X-Webhook-Secret': 'abc\nSECRETVALUE' } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DeliveryError)
    expect((err as Error).message).not.toContain('SECRETVALUE')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('releases the response body when the webhook refuses the report', async () => {
    const cancel = vi.fn(async () => {})
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, body: { cancel } }) as unknown as Response)
    await expect(forwardReport('https://hooks.example.com/abc', { fields: {} })).rejects.toBeInstanceOf(DeliveryError)
    expect(cancel).toHaveBeenCalled()
  })
})
