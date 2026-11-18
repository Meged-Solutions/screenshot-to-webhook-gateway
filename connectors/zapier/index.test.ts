import { afterEach, describe, expect, it, vi } from 'vitest'
import { runConnectorContract } from '../contract.js'
import { DeliveryError } from '../types.js'
import { contractSample, zapier } from './index.js'

runConnectorContract(zapier, contractSample)

const image = { base64: 'aGk=', mimeType: 'image/png', fileName: 'screenshot.png' }

function stubFetch(response: () => Response = () => Response.json({ status: 'success' })) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => response())
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('zapier deliver', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts to the Catch Hook URL rebuilt from the ref on hooks.zapier.com', async () => {
    const fetch = stubFetch()
    await zapier.deliver({ fields: { note: 'hi' } }, '1234567_abcdEF1', {})
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://hooks.zapier.com/hooks/catch/1234567/abcdEF1/')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
  })

  it('sends the shared forward shape and returns the delivery id', async () => {
    const fetch = stubFetch()
    const result = await zapier.deliver({ fields: { note: 'Broken', pageUrl: 'https://example.com' }, image }, '1234567_abcdEF1', {})
    const [, init] = fetch.mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      deliveryId: result.id,
      source: 'screenshot-to-webhook-gateway',
      report: { note: 'Broken', pageUrl: 'https://example.com' },
      image: { mimeType: 'image/png', fileName: 'screenshot.png', base64: 'aGk=' },
    })
    expect(result.id).toMatch(/^dlv_/)
    expect(result.skipped).toEqual([])
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(new Headers(init.headers).get('x-delivery-id')).toBe(result.id)
  })

  it('throws DeliveryError when Zapier refuses the report', async () => {
    stubFetch(() => new Response('not found', { status: 404 }))
    await expect(zapier.deliver({ fields: { note: 'x' } }, '1234567_abcdEF1', {})).rejects.toBeInstanceOf(DeliveryError)
  })

  it('throws DeliveryError when Zapier is unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(zapier.deliver({ fields: { note: 'x' } }, '1234567_abcdEF1', {})).rejects.toBeInstanceOf(DeliveryError)
  })

  it('refuses an invalid ref before any network call', async () => {
    const fetch = stubFetch()
    for (const ref of ['1234567_abc/../x', 'evil.example.com_abcde', '1234567_abcde@evil', '1234567']) {
      await expect(zapier.deliver({ fields: { note: 'x' } }, ref, {}), ref).rejects.toBeInstanceOf(DeliveryError)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('always posts to hooks.zapier.com, whatever valid ref it gets', async () => {
    const fetch = stubFetch()
    for (const ref of ['1_abcde', '999999999999_ABCDEFGHIJKLMNOP', '42_00000']) {
      await zapier.deliver({ fields: { note: 'x' } }, ref, {})
    }
    for (const [url] of fetch.mock.calls) {
      const parsed = new URL(url)
      expect(parsed.origin).toBe('https://hooks.zapier.com')
      expect(parsed.pathname).toMatch(/^\/hooks\/catch\/\d+\/[A-Za-z0-9]+\/$/)
    }
  })
})

describe('zapier isValidRef', () => {
  it.each(['1234567_abcdefg', '123456_zbB61', '1_abcde', '999999999999_ABCDEFGHIJKLMNOP', '1234567_f8f22dgg'])('accepts %s', (ref) => {
    expect(zapier.isValidRef(ref)).toBe(true)
  })

  it.each([
    ['dash separator', '1234567-abcdefg'],
    ['no separator', '1234567abcdefg'],
    ['missing hook id', '1234567_'],
    ['missing account id', '_abcdefg'],
    ['account id only', '1234567'],
    ['three parts', '1234567_abcdefg_extra'],
    ['letters in account id', '12a4567_abcdefg'],
    ['leading zero account id', '0123456_abcdefg'],
    ['account id too long', '1234567890123_abcdefg'],
    ['hook id too short', '1234567_abcd'],
    ['hook id too long', '1234567_ABCDEFGHIJKLMNOPQ'],
    ['underscore in hook id', '1234567_abc_def'],
    ['dash in hook id', '1234567_abc-def'],
    ['URL pasted as ref', 'https://hooks.zapier.com/hooks/catch/1234567/abcdefg/'],
    ['path pasted as ref', '1234567/abcdefg'],
    ['combined hooks', '1234567_zbB61,kzXC4'],
    ['trailing newline', '1234567_abcdefg\n'],
  ])('rejects %s', (_label, ref) => {
    expect(zapier.isValidRef(ref)).toBe(false)
  })
})
