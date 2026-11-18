/**
 * Writes each report as one record in the Tickets table of the base the token
 * names, then uploads the screenshot into its Screenshot field.
 */
import type { ContractSample } from '../contract.js'
import { DeliveryError, requireEnv, type Connector } from '../types.js'
import { createWithRetry, mapFields, type Cells } from './cells.js'
import { verifyLegacyShortToken } from './legacy-token.js'
import { provisioner } from './provision.js'
import { IMAGE_KEY, FIELDS, TABLE_NAME } from './schema.js'

const DATA_API = 'https://api.airtable.com/v0'
const CONTENT_API = 'https://content.airtable.com/v0'
const SCREENSHOT_FIELD = FIELDS.find((f) => f.source === IMAGE_KEY)!.name

/** An Airtable error response, shaped like the SDK's errors so createWithRetry can read the type. */
class AirtableApiError extends Error {
  constructor(
    readonly error: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function createRecord(pat: string, baseId: string, cells: Cells): Promise<string> {
  const res = await fetch(`${DATA_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(TABLE_NAME)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields: cells }], typecast: true }),
  })
  const body = (await res.json().catch(() => ({}))) as { records?: { id: string }[]; error?: { type?: string; message?: string } | string }
  if (!res.ok) {
    const err = typeof body.error === 'object' ? body.error : { type: body.error }
    throw new AirtableApiError(err.type ?? 'UNKNOWN', err.message ?? `HTTP ${res.status}`, res.status)
  }
  const id = body.records?.[0]?.id
  if (!id) throw new Error('Airtable returned no record')
  return id
}

/** Direct upload of the image bytes (max 5 MB): https://airtable.com/developers/web/api/upload-attachment */
async function uploadScreenshot(pat: string, baseId: string, recordId: string, image: NonNullable<Parameters<Connector['deliver']>[0]['image']>) {
  const path = [baseId, recordId, SCREENSHOT_FIELD].map(encodeURIComponent).join('/')
  const res = await fetch(`${CONTENT_API}/${path}/uploadAttachment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: image.mimeType, file: image.base64, filename: image.fileName }),
  })
  if (!res.ok) throw new Error(`Attachment upload failed (${res.status}): ${await res.text().catch(() => '')}`)
}

export const airtable: Connector = {
  id: 'airtable',
  title: 'Airtable',
  env: [
    { name: 'AIRTABLE_PAT', sensitive: true, scope: 'gateway', description: 'Personal access token with data.records:read and data.records:write, limited to the workspace of your bases' },
    { name: 'AIRTABLE_PROVISION_PAT', sensitive: true, scope: 'provision', description: 'Personal access token with schema.bases:read and schema.bases:write, limited to the same workspace. Local only, never deployed' },
    { name: 'AIRTABLE_WORKSPACE_ID', sensitive: false, scope: 'provision', description: 'Workspace id (wsp...) where new bases are created' },
  ],

  isValidRef: (ref) => /^app[A-Za-z0-9]{14}$/.test(ref),

  async deliver(report, baseId, env) {
    const pat = requireEnv(env, 'AIRTABLE_PAT')
    let created
    try {
      created = await createWithRetry((cells) => createRecord(pat, baseId, cells), mapFields(report.fields))
    } catch (err) {
      throw new DeliveryError(`Airtable refused the record: ${(err as Error).message}`)
    }
    if (report.image) {
      try {
        await uploadScreenshot(pat, baseId, created.recordId, report.image)
      } catch (err) {
        throw new DeliveryError((err as Error).message, created.recordId)
      }
    }
    return { id: created.recordId, skipped: created.skipped }
  },

  provisioner,
  verifyLegacy: verifyLegacyShortToken,
}

export const contractSample: ContractSample = { validRef: 'appAbCdEfGhIjKlMn', invalidRefs: ['tbl123', 'appshort', 'recAbCdEfGhIjKlMn'] }
