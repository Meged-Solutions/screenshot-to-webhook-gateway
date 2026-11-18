import { afterEach, describe, expect, it, vi } from 'vitest'
import { runConnectorContract } from '../contract.js'
import { DeliveryError } from '../types.js'
import { airtable, contractSample } from './index.js'

runConnectorContract(airtable, contractSample)

const BASE = 'appAbCdEfGhIjKlMn'
const env = { AIRTABLE_PAT: 'patTest' }
const image = { base64: 'aGk=', mimeType: 'image/png', fileName: 'screenshot.png' }

describe('airtable deliver', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates one Tickets record with Status New, then uploads the screenshot', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.startsWith('https://api.airtable.com') ? Response.json({ records: [{ id: 'recNew' }] }) : Response.json({}),
    )
    vi.stubGlobal('fetch', fetch)
    expect(await airtable.deliver({ fields: { note: 'Broken' }, image }, BASE, env)).toEqual({ id: 'recNew', skipped: [] })
    const [createUrl, create] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(createUrl).toBe(`https://api.airtable.com/v0/${BASE}/Tickets`)
    expect(new Headers(create.headers).get('authorization')).toBe('Bearer patTest')
    expect(JSON.parse(create.body as string)).toEqual({ records: [{ fields: { Summary: 'Broken', Description: 'Broken', Status: 'New' } }], typecast: true })
    const [uploadUrl, upload] = fetch.mock.calls[1] as unknown as [string, RequestInit]
    expect(uploadUrl).toBe(`https://content.airtable.com/v0/${BASE}/recNew/Screenshot/uploadAttachment`)
    expect(JSON.parse(upload.body as string)).toEqual({ contentType: 'image/png', file: 'aGk=', filename: 'screenshot.png' })
  })

  it('skips a field Airtable refuses and reports it', async () => {
    let calls = 0
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      calls++
      const fields = JSON.parse(init.body as string).records[0].fields
      if ('Tag' in fields) return Response.json({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "Tag"' } }, { status: 422 })
      return Response.json({ records: [{ id: 'recNew' }] })
    })
    expect(await airtable.deliver({ fields: { note: 'x', tag: 'Bug' } }, BASE, env)).toEqual({ id: 'recNew', skipped: ['Tag'] })
    expect(calls).toBe(2)
  })

  it('throws DeliveryError when Airtable refuses the record', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: { type: 'AUTHENTICATION_REQUIRED', message: 'no' } }, { status: 401 }))
    await expect(airtable.deliver({ fields: { note: 'x' } }, BASE, env)).rejects.toBeInstanceOf(DeliveryError)
  })

  it('throws DeliveryError carrying the record id when the upload fails', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.startsWith('https://api.airtable.com') ? Response.json({ records: [{ id: 'recNew' }] }) : new Response('too big', { status: 413 }),
    )
    const err = await airtable.deliver({ fields: { note: 'x' }, image }, BASE, env).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DeliveryError)
    expect((err as DeliveryError).id).toBe('recNew')
  })
})
