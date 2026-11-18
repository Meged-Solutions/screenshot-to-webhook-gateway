import { describe, expect, it } from 'vitest'
import { isReporterHeader, parsePayload, PayloadError, reporterFromHeaders } from './payload.js'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const report = {
  image: `data:image/png;base64,${PNG}`,
  imageBase64: PNG,
  imageMimeType: 'image/png',
  imageFileName: 'screenshot.png',
  note: 'Button overlaps footer\nOnly on mobile',
  pins: [{ number: 1, text: 'misaligned' }],
  pinsText: '1. misaligned',
  pinCount: 1,
  pageUrl: 'https://example.com',
  pageTitle: 'Settings',
  browser: 'Chrome',
}

describe('payload parsing', () => {
  const json = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    parsePayload(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }))

  it('parses extension JSON into fields and one image', async () => {
    const p = await json(report)
    expect(p.image).toEqual({ base64: PNG, mimeType: 'image/png', fileName: 'screenshot.png' })
    expect(p.fields).not.toHaveProperty('imageBase64')
    expect(p.fields).toMatchObject({ note: report.note, pinCount: 1, pageUrl: 'https://example.com' })
  })
  it('fills reporter from the reporter header unless the body sets it', async () => {
    expect((await json({ note: 'hi' }, { reporter: ' Dana ' })).fields.reporter).toBe('Dana')
    expect((await json({ reporter: 'Noa' }, { reporter: 'Dana' })).fields.reporter).toBe('Noa')
    expect((await json({ reporter: '  ' }, { reporter: 'Dana' })).fields.reporter).toBe('Dana')
  })
  it('treats a null, empty or missing tag as no tag', async () => {
    expect((await json({ tag: 'Bug' })).fields.tag).toBe('Bug')
    expect((await json({ tag: null })).fields).not.toHaveProperty('tag')
    expect((await json({})).fields).not.toHaveProperty('tag')
    const fd = new FormData()
    fd.set('tag', '')
    expect((await parsePayload(new Request('http://x', { method: 'POST', body: fd }))).fields).not.toHaveProperty('tag')
  })
  it('rejects malformed bodies with PayloadError', async () => {
    const send = (body: string, type: string) => parsePayload(new Request('http://x', { method: 'POST', headers: { 'content-type': type }, body }))
    await expect(send('{', 'application/json')).rejects.toBeInstanceOf(PayloadError)
    await expect(send('[1]', 'application/json')).rejects.toBeInstanceOf(PayloadError)
    await expect(send('x', 'text/plain')).rejects.toBeInstanceOf(PayloadError)
  })
  it('parses extension multipart with a file part', async () => {
    const fd = new FormData()
    fd.set('image', new File([Buffer.from(PNG, 'base64')], 'screenshot.png', { type: 'image/png' }))
    fd.set('note', 'hi')
    fd.set('pins', JSON.stringify(report.pins))
    const p = await parsePayload(new Request('http://x', { method: 'POST', body: fd }))
    expect(p.image?.base64).toBe(PNG)
    expect(p.fields).toEqual({ note: 'hi', pins: report.pins })
  })
  it('keeps a tag to one clean line and drops values that are not text', async () => {
    const tagOf = async (tag: unknown) =>
      (await parsePayload(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tag }) }))).fields.tag
    expect(await tagOf('  Needs\n design \t')).toBe('Needs design')
    expect(await tagOf('x'.repeat(300))).toHaveLength(100)
    expect(await tagOf('   ')).toBeUndefined()
    expect(await tagOf(['Bug'])).toBeUndefined()
    expect(await tagOf({ name: 'Bug' })).toBeUndefined()
    const fd = new FormData()
    fd.set('tag', '2026')
    expect((await parsePayload(new Request('http://x', { method: 'POST', body: fd }))).fields.tag).toBe('2026')
  })
  it('accepts reporter header variants and typos, not unrelated headers', () => {
    for (const name of ['Reporter', 'REPORTER', 'reported-by', 'Reported_By', 'report-by', 'repoter', 'reproter', 'reporterr', 'reportr'])
      expect(isReporterHeader(name), name).toBe(true)
    for (const name of ['referer', 'report', 'authorization', 'content-type', 'x-reporter-id', 'rep'])
      expect(isReporterHeader(name), name).toBe(false)
  })
  it('ignores empty reporter values and keeps one clean line', () => {
    expect(reporterFromHeaders(new Headers({ reporter: '   ' }))).toBeUndefined()
    expect(reporterFromHeaders(new Headers({ reporter: '' }))).toBeUndefined()
    expect(reporterFromHeaders(new Headers({ reporter: '  Dana \t Levi ' }))).toBe('Dana Levi')
    expect(reporterFromHeaders(new Headers({ reporter: 'x'.repeat(300) }))?.length).toBe(100)
    expect(reporterFromHeaders(new Headers({ 'reported-by': '', repoter: 'Dana' }))).toBe('Dana')
  })
})
