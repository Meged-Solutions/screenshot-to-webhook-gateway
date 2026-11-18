/**
 * Parses the two body formats the Screenshot to Webhook - Annotate & Send
 * extension sends (JSON and multipart, see docs/payload.md) into flat fields
 * plus one image.
 */
export type Image = { base64: string; mimeType: string; fileName: string }
export type ParsedPayload = { fields: Record<string, unknown>; image: Image | undefined }

/** Keys that carry the image itself; never written as plain fields. */
const IMAGE_KEYS = new Set(['image', 'imageBase64', 'imageMimeType', 'imageFileName'])

export class PayloadError extends Error {}

function tryJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function imageFromDataUrl(dataUrl: string): Image | undefined {
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s.exec(dataUrl)
  if (!match?.[2]) return undefined
  const mimeType = match[1] || 'application/octet-stream'
  return { base64: match[2], mimeType, fileName: `screenshot.${mimeType.split('/')[1] || 'bin'}` }
}

function imageFromJson(json: Record<string, unknown>): Image | undefined {
  const { imageBase64, imageMimeType, imageFileName, image } = json
  if (typeof imageBase64 === 'string' && imageBase64) {
    const mimeType = typeof imageMimeType === 'string' && imageMimeType ? imageMimeType : 'image/png'
    const fileName =
      typeof imageFileName === 'string' && imageFileName ? imageFileName : `screenshot.${mimeType.split('/')[1]}`
    return { base64: imageBase64, mimeType, fileName }
  }
  return typeof image === 'string' ? imageFromDataUrl(image) : undefined
}

function withoutImageKeys(entries: Iterable<[string, unknown]>): Record<string, unknown> {
  return Object.fromEntries([...entries].filter(([key]) => !IMAGE_KEYS.has(key)))
}

/**
 * The reporter custom header, as typed by hand in the extension's settings. Names are
 * compared on letters only, so "Reporter", "reported-by" or "Reported_By"
 * match, and one typo ("repoter", "reproter") is forgiven.
 */
const REPORTER_NAMES = ['reporter', 'reportedby', 'reporterby', 'reportby']
const REPORTER_MAX = 100

/** Optimal string alignment distance, capped: a transposition counts as one edit. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1)
      d[i]![j] = v
    }
  }
  return d[a.length]![b.length]!
}

export function isReporterHeader(name: string): boolean {
  const letters = name.toLowerCase().replace(/[^a-z]/g, '')
  return REPORTER_NAMES.some((known) => editDistance(letters, known) <= 1)
}

/** Control characters and runs of whitespace collapse to one space. */
const oneLine = (value: string, max: number) => value.replace(/[\p{C}\s]+/gu, ' ').trim().slice(0, max)

/** The first non-empty reporter header value, as one trimmed line. */
export function reporterFromHeaders(headers: Headers): string | undefined {
  for (const [name, raw] of headers) {
    if (!isReporterHeader(name)) continue
    const value = oneLine(raw, REPORTER_MAX)
    if (value) return value
  }
  return undefined
}

/**
 * The extension's tag becomes a select option, so it is kept to one short line. JSON
 * null and an empty multipart part both mean "No tag", as does a missing key
 * (extensions before 1.3.0). Multipart text such as "2026" arrives parsed as a
 * number and is read back as text; lists and objects are not tags.
 */
const TAG_MAX = 100

function tagOf(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return undefined
  return oneLine(String(value), TAG_MAX) || undefined
}

export async function parsePayload(request: Request): Promise<ParsedPayload> {
  const payload = await parseBody(request)
  const reporter = reporterFromHeaders(request.headers)
  const fromBody = payload.fields.reporter
  if (reporter && (typeof fromBody !== 'string' || !fromBody.trim())) payload.fields.reporter = reporter
  const tag = tagOf(payload.fields.tag)
  if (tag) payload.fields.tag = tag
  else delete payload.fields.tag
  return payload
}

async function parseBody(request: Request): Promise<ParsedPayload> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => {
      throw new PayloadError('Malformed multipart body')
    })
    const textEntries: [string, unknown][] = []
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') textEntries.push([key, tryJson(value)])
    }
    const file = form.get('image')
    const image =
      file instanceof File
        ? {
            base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
            mimeType: file.type || 'application/octet-stream',
            fileName: file.name || 'screenshot.png',
          }
        : imageFromJson(Object.fromEntries(textEntries))
    return { fields: withoutImageKeys(textEntries), image }
  }

  if (contentType.startsWith('application/json')) {
    const json: unknown = await request.json().catch(() => {
      throw new PayloadError('Malformed JSON body')
    })
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new PayloadError('JSON body must be an object')
    }
    const record = json as Record<string, unknown>
    return { fields: withoutImageKeys(Object.entries(record)), image: imageFromJson(record) }
  }

  throw new PayloadError('Unsupported Content-Type: use application/json or multipart/form-data')
}
