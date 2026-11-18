import { describe, expect, it } from 'vitest'
import { createWithRetry, mapFields } from './cells.js'

describe('mapFields', () => {
  it('maps a report to field names with summary and status', () => {
    expect(
      mapFields({ note: 'Button overlaps footer\nOnly on mobile', pinsText: '1. misaligned', pinCount: 1, pageUrl: 'https://example.com', pageTitle: 'Settings', browser: 'Chrome', pins: [{ n: 1 }], unknown: 'x' }),
    ).toEqual({
      Summary: 'Button overlaps footer',
      Status: 'New',
      Description: 'Button overlaps footer\nOnly on mobile',
      Pins: '1. misaligned',
      'Pin Count': 1,
      'Page URL': 'https://example.com',
      'Page Title': 'Settings',
      Browser: 'Chrome',
    })
  })
  it('falls back to the page title for the summary', () => {
    expect(mapFields({ pageTitle: 'Settings' }).Summary).toBe('Settings')
  })
  it('maps tag and reporter', () => {
    expect(mapFields({ tag: 'Bug', reporter: 'Dana' })).toMatchObject({ Tag: 'Bug', Reporter: 'Dana' })
  })
  it('fits each value to its column type, so one odd value cannot sink the ticket', () => {
    const cells = mapFields({ capturedAt: 'not a date', pinCount: 'abc', browser: true, note: 'x'.repeat(200_000) })
    expect(cells['Captured At']).toBeUndefined()
    expect(cells['Pin Count']).toBeUndefined()
    expect(cells.Browser).toBe('true')
    expect(cells.Description).toHaveLength(100_000)
    const valid = mapFields({ capturedAt: '2026-08-26T12:34:56.000Z', pinCount: '3', os: true })
    expect(valid).toMatchObject({ 'Captured At': '2026-08-26T12:34:56.000Z', 'Pin Count': 3, OS: 'true' })
  })
})

describe('createWithRetry', () => {
  const rejection = (error: string, message: string) => Object.assign(new Error(message), { error })
  const airtable = (bad: Record<string, Error>) => {
    const calls: string[][] = []
    const create = async (fields: Record<string, unknown>) => {
      calls.push(Object.keys(fields))
      const hit = Object.keys(fields).find((k) => bad[k])
      if (hit) throw bad[hit]
      return 'recNew'
    }
    return { calls, create }
  }

  it('drops a field the base renamed, deleted or cannot parse, and keeps the rest', async () => {
    const { calls, create } = airtable({
      Tag: rejection('UNKNOWN_FIELD_NAME', 'Unknown field name: "Tag"'),
      'Page Title': rejection('INVALID_VALUE_FOR_COLUMN', 'Field "Page Title" cannot accept the provided value'),
    })
    expect(await createWithRetry(create, { Summary: 's', Tag: 'Bug', 'Page Title': 'p', Page: 'x' })).toEqual({ recordId: 'recNew', skipped: ['Tag', 'Page Title'] })
    expect(calls.at(-1)).toEqual(['Summary', 'Page'])
  })
  it('matches the longest field name in the message', async () => {
    const { create } = airtable({ 'Page URL': rejection('INVALID_VALUE_FOR_COLUMN', 'Cannot parse value for field Page URL') })
    expect((await createWithRetry(create, { Page: 'a', 'Page URL': 'b' })).skipped).toEqual(['Page URL'])
  })
  it('rethrows errors that do not name a field it sent', async () => {
    const auth = rejection('AUTHENTICATION_REQUIRED', 'Authentication required')
    await expect(createWithRetry(airtable({ Summary: auth }).create, { Summary: 's' })).rejects.toBe(auth)
  })
})
