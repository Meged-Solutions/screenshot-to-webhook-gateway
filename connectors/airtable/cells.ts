import { FIELDS, IMAGE_KEY, STATUS_FIELD, STATUS_NEW } from './schema.js'

/** Cell values as Airtable's REST API takes them, keyed by field name. */
export type Cells = Record<string, string | number>

/** Airtable's limit for a text cell; a longer value fails the whole record. */
const MAX_TEXT = 100_000
const WRITTEN = FIELDS.filter((f) => f.source && f.source !== IMAGE_KEY)

/**
 * Fits a report value to its column type, since Airtable rejects the whole
 * record over one value it cannot parse (even with typecast). A value that
 * cannot fit is dropped. Text columns take anything as text: multipart parses
 * "42" or "true" into a number or boolean, which a text column refuses, and
 * nested values are stored as readable JSON.
 */
function toCellValue(value: unknown, type: string): string | number | undefined {
  if (value === null || value === undefined) return undefined
  if (type === 'number') {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
    return Number.isFinite(n) ? n : undefined
  }
  if (type === 'dateTime') {
    const time = typeof value === 'string' ? Date.parse(value) : NaN
    return Number.isNaN(time) ? undefined : new Date(time).toISOString()
  }
  const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  return text.slice(0, MAX_TEXT) || undefined
}

/** One-line title for the primary field: the note's first line, else the page title. */
export function summaryOf(report: Record<string, unknown>): string | undefined {
  const firstLine = typeof report.note === 'string' ? report.note.trim().split('\n')[0] : ''
  const fallback = typeof report.pageTitle === 'string' ? report.pageTitle : ''
  return (firstLine || fallback).slice(0, 120) || undefined
}

/** The Tickets cells for a report; keys the schema does not know are ignored. */
export function mapFields(report: Record<string, unknown>): Cells {
  const values: Record<string, unknown> = { ...report, summary: summaryOf(report) }
  const cells: Cells = {}
  for (const field of WRITTEN) {
    const cell = toCellValue(values[field.source!], field.type)
    if (cell !== undefined) cells[field.name] = cell
  }
  cells[STATUS_FIELD] = STATUS_NEW
  return cells
}

/** Airtable errors that fail a record over one field, and name it in the message. */
const FIELD_ERRORS = new Set(['UNKNOWN_FIELD_NAME', 'INVALID_VALUE_FOR_COLUMN'])

/** The sent field an Airtable error is about; the longest match wins, so "Page URL" beats "Page". */
function rejectedField(err: unknown, sent: readonly string[]): string | undefined {
  const { error, message } = (err ?? {}) as { error?: unknown; message?: unknown }
  if (typeof error !== 'string' || !FIELD_ERRORS.has(error) || typeof message !== 'string') return undefined
  const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return sent
    .filter((name) => new RegExp(`(^|[^\\w])${escape(name)}($|[^\\w])`).test(message))
    .sort((a, b) => b.length - a.length)[0]
}

export type Created = { recordId: string; skipped: string[] }

/**
 * Creates the record, dropping each field Airtable refuses and trying again.
 * The team owns the base and may rename, delete or retype a field; that costs
 * the field's value on new tickets, never the ticket. Every retry sends fewer
 * fields, so the loop ends; errors that name no sent field are rethrown.
 */
export async function createWithRetry(create: (cells: Cells) => Promise<string>, cells: Cells): Promise<Created> {
  const pending = { ...cells }
  const skipped: string[] = []
  for (;;) {
    try {
      return { recordId: await create(pending), skipped }
    } catch (err) {
      const field = rejectedField(err, Object.keys(pending))
      if (!field) throw err
      delete pending[field]
      skipped.push(field)
    }
  }
}
