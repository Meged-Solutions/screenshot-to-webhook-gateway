/**
 * The Tickets table every base is created with, and which report key (see
 * docs/payload.md) fills each field. The order is the column order; the first field
 * is the table's primary field.
 */
export const TABLE_NAME = 'Tickets'
export const STATUS_FIELD = 'Status'
export const STATUS_NEW = 'New'
/** Airtable-maintained running number (1, 2, 3...), so tickets can be referred to by id. */
export const TICKET_ID_FIELD = 'Ticket ID'
/** The tag picked in the extension's editor, one per report. */
export const TAG_FIELD = 'Tag'
/** The ticket the team actually works on, written from the reporter's feedback in Summary. */
export const TICKET_DESCRIPTION_FIELD = 'Ticket Description'
const TICKET_DESCRIPTION_HELP =
  "The ticket to work on, written by the team. Summary keeps the reporter's original feedback."
/** Intake, refinement, delivery, verification and closure, in workflow order. */
const STATUS_CHOICES = [
  'New',
  'Triage',
  'Needs info',
  'Backlog',
  'Ready for dev',
  'In progress',
  'In review',
  'Ready for QA',
  'In QA',
  'Ready for release',
  'Done',
  'Duplicate',
  "Won't fix",
]

/** Payload key for the screenshot; it is uploaded rather than written as a cell. */
export const IMAGE_KEY = 'image'

type FieldSpec = {
  name: string
  type: string
  /** Help text shown under the field name in Airtable. */
  description?: string
  options?: Record<string, unknown>
  /** Report key that fills this field; absent for fields the team edits. */
  source?: string
}

export const FIELDS: readonly FieldSpec[] = [
  { name: 'Summary', type: 'singleLineText', source: 'summary' },
  { name: TICKET_ID_FIELD, type: 'autoNumber' },
  // Airtable's own record id (rec...), for API calls, automations and links.
  { name: 'Record ID', type: 'formula', options: { formula: 'RECORD_ID()' } },
  // Feedback is not always the ticket to work on, so the team restates it here and Summary keeps the original.
  { name: TICKET_DESCRIPTION_FIELD, type: 'multilineText', description: TICKET_DESCRIPTION_HELP },
  {
    name: STATUS_FIELD,
    type: 'singleSelect',
    options: { choices: STATUS_CHOICES.map((name) => ({ name })) },
  },
  { name: 'Priority', type: 'singleSelect', options: { choices: ['Low', 'Medium', 'High', 'Urgent'].map((name) => ({ name })) } },
  // The extension's tag list differs per user, so options start empty and typecast adds each new tag.
  { name: TAG_FIELD, type: 'singleSelect', options: { choices: [] }, source: 'tag' },
  { name: 'Assignee', type: 'singleCollaborator' },
  { name: 'Due Date', type: 'date', options: { dateFormat: { name: 'iso' } } },
  { name: 'Description', type: 'multilineText', source: 'note' },
  { name: 'Ticket Enhancement', type: 'multilineText' },
  { name: 'Screenshot', type: 'multipleAttachments', source: IMAGE_KEY },
  { name: 'Pins', type: 'multilineText', source: 'pinsText' },
  { name: 'Page URL', type: 'url', source: 'pageUrl' },
  { name: 'Page Title', type: 'singleLineText', source: 'pageTitle' },
  {
    name: 'Captured At',
    type: 'dateTime',
    options: { timeZone: 'client', dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' } },
    source: 'capturedAt',
  },
  { name: 'Browser', type: 'singleLineText', source: 'browser' },
  { name: 'OS', type: 'singleLineText', source: 'os' },
  { name: 'Screen', type: 'singleLineText', source: 'screen' },
  { name: 'Viewport', type: 'singleLineText', source: 'viewport' },
  { name: 'Pin Count', type: 'number', options: { precision: 0 }, source: 'pinCount' },
  { name: 'Completion Note', type: 'multilineText' },
  { name: 'Additional Comments', type: 'multilineText' },
  { name: 'Completed At', type: 'date', options: { dateFormat: { name: 'iso' } } },
  { name: 'Reporter', type: 'singleLineText', source: 'reporter' },
]

const fieldDefinition = ({ source: _source, ...field }: FieldSpec) => field

const BASE_SUFFIX = ' - Feedback'
export const MAX_CUSTOMER_NAME = 80

/** The base name for a customer; also the dedup key when provisioning again. */
export const baseName = (customer: string) => `${customer}${BASE_SUFFIX}`

/** The customer name a provisioned base was created for, or undefined for other bases. */
export const customerFromBaseName = (name: string) =>
  name.endsWith(BASE_SUFFIX) ? name.slice(0, -BASE_SUFFIX.length).trim() || undefined : undefined

/** Trims and validates a customer name; throws a message fit for the CLI. */
export function validateCustomerName(raw: string | undefined): string {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!name) throw new Error('A customer name is required: --name "<Customer name>"')
  if (name.length > MAX_CUSTOMER_NAME) throw new Error(`Customer name must be at most ${MAX_CUSTOMER_NAME} characters`)
  if (/[\p{Cc}]/u.test(name)) throw new Error('Customer name must not contain control characters')
  if (customerFromBaseName(name)) throw new Error(`Pass the customer name only, without "${BASE_SUFFIX.trim()}"`)
  return name
}

/**
 * Written into the Tickets table description of every base this tool creates.
 * A re-run only reuses a base carrying it, so a same-named base the token can
 * see but we did not create is never adopted and handed out in a token.
 */
export const PROVISION_MARKER = '[screenshot-to-webhook-gateway]'
const TABLE_DESCRIPTION = `Feedback tickets from the Screenshot to Webhook - Annotate & Send extension. ${PROVISION_MARKER}`

export const isProvisionedTable = (table: { description?: string }) =>
  table.description?.includes(PROVISION_MARKER) ?? false

/** Airtable create-table request body for the Tickets table. */
export function tableDefinition() {
  return { name: TABLE_NAME, description: TABLE_DESCRIPTION, fields: FIELDS.map(fieldDefinition) }
}

/** Airtable create-base request body for one customer. */
export function baseDefinition(name: string, workspaceId: string) {
  return { name, workspaceId, tables: [tableDefinition()] }
}

/**
 * Field definitions the Tickets table lacks, matched by name. Existing fields
 * are never changed, so edits the team made in Airtable survive a re-run.
 */
export function missingFieldDefinitions(existing: readonly { name: string }[]) {
  const names = new Set(existing.map((f) => f.name.toLowerCase()))
  return FIELDS.filter((f) => !names.has(f.name.toLowerCase())).map(fieldDefinition)
}

