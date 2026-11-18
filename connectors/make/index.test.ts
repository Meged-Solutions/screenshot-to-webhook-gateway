import { afterEach, describe, expect, it, vi } from 'vitest'
import { REF } from '../../lib/token.js'
import { runConnectorContract } from '../contract.js'
import { DeliveryError } from '../types.js'
import { contractSample, make } from './index.js'

runConnectorContract(make, contractSample)

const HOOK_PATH = 'abcdefghij0123456789klmnopqrstuv'

function stubFetch(response: () => Response = () => new Response('Accepted')) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => response())
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('make connector', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('needs no env vars', () => {
    expect(make.env).toEqual([])
  })

  it.each(['eu1', 'eu2', 'us1', 'us2'])('posts to hook.%s.make.com/<token>', async (zone) => {
    const fetch = stubFetch()
    await make.deliver({ fields: { note: 'hi' } }, `${zone}_${HOOK_PATH}`, {})
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe(`https://hook.${zone}.make.com/${HOOK_PATH}`)
  })

  it('forwards the shared report shape and returns the delivery id', async () => {
    const fetch = stubFetch()
    const image = { mimeType: 'image/png', fileName: 'shot.png', base64: 'aGk=' }
    const result = await make.deliver({ fields: { note: 'hi' }, image } as never, `eu1_${HOOK_PATH}`, {})
    const init = fetch.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      deliveryId: result.id,
      source: 'screenshot-to-webhook-gateway',
      report: { note: 'hi' },
      image: { mimeType: 'image/png', fileName: 'shot.png', base64: 'aGk=' },
    })
    expect(result).toEqual({ id: expect.stringMatching(/^dlv_/), skipped: [] })
  })

  it.each([400, 404, 410, 429, 500])('throws DeliveryError when Make answers %i', async (status) => {
    stubFetch(() => new Response('Gone', { status }))
    await expect(make.deliver({ fields: {} }, `us2_${HOOK_PATH}`, {})).rejects.toBeInstanceOf(DeliveryError)
  })

  it('throws DeliveryError when Make is unreachable', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(make.deliver({ fields: {} }, `eu2_${HOOK_PATH}`, {})).rejects.toBeInstanceOf(DeliveryError)
  })

  it('accepts every real zone with a 32-character lowercase token', () => {
    for (const zone of ['eu1', 'eu2', 'us1', 'us2']) expect(make.isValidRef(`${zone}_${HOOK_PATH}`)).toBe(true)
  })

  it.each([
    ['unknown zone', `eu3_${HOOK_PATH}`],
    ['uppercase zone', `EU1_${HOOK_PATH}`],
    ['legacy zone-less host', `hook_${HOOK_PATH}`],
    ['missing zone', HOOK_PATH],
    ['missing token', 'eu1_'],
    ['missing separator', `eu1${HOOK_PATH}`],
    ['dash separator', `eu1-${HOOK_PATH}`],
    ['token too short', `eu1_${HOOK_PATH.slice(1)}`],
    ['token too long', `eu1_${HOOK_PATH}a`],
    ['uppercase token', `eu1_${HOOK_PATH.toUpperCase()}`],
    ['underscore in token', `eu1_${HOOK_PATH.slice(1)}_`],
    ['dash in token', `eu1_${HOOK_PATH.slice(1)}-`],
    ['extra part', `eu1_${HOOK_PATH}_x`],
    ['URL pasted as ref', `https://hook.eu1.make.com/${HOOK_PATH}`],
    ['host smuggled in zone', `evil.example.com_${HOOK_PATH}`],
    ['path traversal', `eu1_../${HOOK_PATH}`],
    ['inherited key as zone', `constructor_${HOOK_PATH}`],
  ])('rejects %s', (_label, ref) => {
    expect(make.isValidRef(ref)).toBe(false)
  })

  it('never contacts another host, even for a ref that skipped isValidRef', async () => {
    const fetch = stubFetch()
    for (const ref of [`evil.example.com_${HOOK_PATH}`, `eu1_${HOOK_PATH}@evil.example.com`, `eu1_../../${HOOK_PATH}`, 'eu1_x/y?z#w']) {
      await expect(make.deliver({ fields: {} }, ref, {})).rejects.toBeInstanceOf(DeliveryError)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('has a contract sample that fits REF', () => {
    expect(REF.test(contractSample.validRef)).toBe(true)
  })
})
