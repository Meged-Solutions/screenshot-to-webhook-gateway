/**
 * Creates and upgrades Airtable bases through the Meta API. Runs from the
 * local CLI only: AIRTABLE_PROVISION_PAT can create bases and must never
 * reach the deployed gateway.
 *
 * Safe to re-run: a base named "<name> - Feedback" whose Tickets table carries
 * PROVISION_MARKER is reused and only missing fields are added. A same-named
 * base without the marker stops the run instead of being adopted.
 */
import type { Provisioner } from '../types.js'
import { requireEnv } from '../types.js'
import {
  baseDefinition,
  baseName,
  customerFromBaseName,
  isProvisionedTable,
  missingFieldDefinitions,
  PROVISION_MARKER,
  TABLE_NAME,
  validateCustomerName,
} from './schema.js'

type Table = { id: string; name: string; description?: string; fields: { id: string; name: string }[] }
type BaseSummary = { id: string; name: string }

const META_API = 'https://api.airtable.com/v0/meta'
export const baseUrl = (baseId: string) => `https://airtable.com/${baseId}`

async function meta<T>(pat: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${META_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Airtable ${init.method ?? 'GET'} ${path} failed (${res.status}): ${body}`)
  return JSON.parse(body) as T
}

async function listBases(pat: string): Promise<BaseSummary[]> {
  const bases: BaseSummary[] = []
  let offset: string | undefined
  do {
    const page = await meta<{ bases: BaseSummary[]; offset?: string }>(pat, `/bases${offset ? `?offset=${encodeURIComponent(offset)}` : ''}`)
    bases.push(...page.bases)
    offset = page.offset
  } while (offset)
  return bases
}

const tablesOf = async (pat: string, baseId: string) =>
  (await meta<{ tables: Table[] }>(pat, `/bases/${encodeURIComponent(baseId)}/tables`)).tables

async function findBase(pat: string, name: string): Promise<BaseSummary | undefined> {
  const matches = (await listBases(pat)).filter((b) => b.name.trim().toLowerCase() === name.toLowerCase())
  if (matches.length > 1) {
    throw new Error(`Several bases are named "${name}" (${matches.map((b) => b.id).join(', ')}); rename or delete the extras`)
  }
  return matches[0]
}

/** Bases this tool created: named "<name> - Feedback" with a marked Tickets table. */
async function listProvisioned(pat: string): Promise<{ name: string; baseId: string }[]> {
  const candidates = (await listBases(pat)).flatMap((b) => {
    const name = customerFromBaseName(b.name)
    return name ? [{ name, baseId: b.id }] : []
  })
  const checked = await Promise.all(candidates.map(async (c) => ((await tablesOf(pat, c.baseId)).some(isProvisionedTable) ? c : undefined)))
  return checked.filter((c) => c !== undefined).sort((x, y) => x.name.localeCompare(y.name))
}

/** Adds the Tickets fields an existing marked base lacks; existing fields are never changed. */
async function repairBase(pat: string, baseId: string, name: string): Promise<string[]> {
  const table = (await tablesOf(pat, baseId)).find((t) => t.name.toLowerCase() === TABLE_NAME.toLowerCase() && isProvisionedTable(t))
  if (!table) {
    throw new Error(
      `Base "${name}" (${baseId}) exists but was not created by this tool: its "${TABLE_NAME}" table lacks ` +
        `${PROVISION_MARKER} in its description. Rename that base, or add the marker if it is yours.`,
    )
  }
  const added: string[] = []
  for (const field of missingFieldDefinitions(table.fields)) {
    const path = `/bases/${encodeURIComponent(baseId)}/tables/${encodeURIComponent(table.id)}/fields`
    const created = await meta<{ name: string }>(pat, path, { method: 'POST', body: JSON.stringify(field) })
    added.push(`added field "${created.name}"`)
  }
  return added
}

export const provisioner: Provisioner = {
  async create(rawName, env) {
    const pat = requireEnv(env, 'AIRTABLE_PROVISION_PAT')
    const requested = validateCustomerName(rawName)
    const existing = await findBase(pat, baseName(requested))
    if (existing) {
      const name = customerFromBaseName(existing.name) ?? requested
      const notes = await repairBase(pat, existing.id, baseName(name))
      return { ref: existing.id, url: baseUrl(existing.id), reused: true, notes: notes.length ? notes : ['schema already complete'] }
    }
    const workspaceId = requireEnv(env, 'AIRTABLE_WORKSPACE_ID')
    const base = await meta<{ id: string; tables: Table[] }>(pat, '/bases', {
      method: 'POST',
      body: JSON.stringify(baseDefinition(baseName(requested), workspaceId)),
    })
    return { ref: base.id, url: baseUrl(base.id), reused: false, notes: [] }
  },

  async list(env) {
    const pat = requireEnv(env, 'AIRTABLE_PROVISION_PAT')
    return (await listProvisioned(pat)).map(({ name, baseId }) => ({ name, ref: baseId, url: baseUrl(baseId) }))
  },

  async upgrade(env) {
    const pat = requireEnv(env, 'AIRTABLE_PROVISION_PAT')
    const results: { name: string; changes: string[] }[] = []
    // One base at a time; a failure stops the run, and re-running skips what was already added.
    for (const { name, baseId } of await listProvisioned(pat)) {
      results.push({ name, changes: await repairBase(pat, baseId, baseName(name)) })
    }
    return results
  },
}
