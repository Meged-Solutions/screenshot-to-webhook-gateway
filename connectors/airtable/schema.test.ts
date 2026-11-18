import { describe, expect, it } from 'vitest'
import { baseDefinition, customerFromBaseName, FIELDS, isProvisionedTable, missingFieldDefinitions, tableDefinition, validateCustomerName } from './schema.js'

describe('Tickets schema', () => {
  it('creates only the Tickets table', () => {
    expect(baseDefinition('Acme - Feedback', 'wspX').tables.map((t) => t.name)).toEqual(['Tickets'])
  })
  it('marks the table and names the extension', () => {
    const { description } = tableDefinition()
    expect(description).toContain('[screenshot-to-webhook-gateway]')
    expect(description).toContain('Screenshot to Webhook - Annotate & Send')
  })
  it('defines Summary as the primary field and strips source keys', () => {
    const def = baseDefinition('Acme - Feedback', 'wsp1')
    expect(def.tables[0]!.fields[0]).toEqual({ name: 'Summary', type: 'singleLineText' })
    expect(JSON.stringify(def)).not.toContain('source')
  })
  it('offers the ticket management fields', () => {
    const names = FIELDS.map((f) => f.name)
    for (const name of ['Priority', 'Assignee', 'Due Date', 'Ticket Enhancement', 'Completion Note', 'Additional Comments', 'Ticket ID', 'Status'])
      expect(names).toContain(name)
  })
  it('has a team-written Ticket Description and a RECORD_ID() formula', () => {
    expect(FIELDS.find((f) => f.name === 'Ticket Description')).toMatchObject({ type: 'multilineText' })
    expect(FIELDS.find((f) => f.name === 'Ticket Description')?.source).toBeUndefined()
    expect(FIELDS.find((f) => f.name === 'Record ID')).toEqual({ name: 'Record ID', type: 'formula', options: { formula: 'RECORD_ID()' } })
  })
  it('lists only missing fields, matching names case-insensitively', () => {
    const existing = FIELDS.filter((f) => f.name !== 'Browser').map((f) => ({ name: f.name.toUpperCase() }))
    expect(missingFieldDefinitions(existing)).toEqual([{ name: 'Browser', type: 'singleLineText' }])
    expect(missingFieldDefinitions(FIELDS)).toEqual([])
  })
  it('requires and normalizes a customer name', () => {
    expect(validateCustomerName('  Acme   Corp ')).toBe('Acme Corp')
    expect(() => validateCustomerName(undefined)).toThrow('required')
    expect(() => validateCustomerName('x'.repeat(81))).toThrow('80')
    expect(() => validateCustomerName('Acme - Feedback')).toThrow('without')
  })
  it('recovers the customer from a base name', () => {
    expect(customerFromBaseName('Acme - Feedback')).toBe('Acme')
    expect(customerFromBaseName('Roadmap')).toBeUndefined()
  })
  it('only treats marked tables as ours', () => {
    expect(isProvisionedTable(tableDefinition())).toBe(true)
    expect(isProvisionedTable({ description: '[some-other-tool]' })).toBe(false)
    expect(isProvisionedTable({})).toBe(false)
  })
})
