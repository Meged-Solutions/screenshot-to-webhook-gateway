import { describe, expect, it } from 'vitest'
import { parseProvisionArgs } from './provision-args.js'

describe('parseProvisionArgs', () => {
  it('creates a named destination', () => {
    expect(parseProvisionArgs(['--connector', 'airtable', '--name', 'Acme'])).toEqual({ connector: 'airtable', mode: 'create', name: 'Acme' })
  })
  it('lists and upgrades', () => {
    expect(parseProvisionArgs(['--connector', 'airtable', '--list'])).toEqual({ connector: 'airtable', mode: 'list' })
    expect(parseProvisionArgs(['--connector', 'airtable', '--upgrade'])).toEqual({ connector: 'airtable', mode: 'upgrade' })
  })
  it('issues a token for an existing destination with --ref', () => {
    expect(parseProvisionArgs(['--connector', 'airtable', '--ref', 'appAbCdEfGhIjKlMn'])).toEqual({ connector: 'airtable', mode: 'token', ref: 'appAbCdEfGhIjKlMn' })
  })
  it('requires a connector and names the available ones', () => {
    expect(() => parseProvisionArgs(['--name', 'Acme'])).toThrow('--connector is required (available: airtable, github, make, n8n, zapier)')
    expect(() => parseProvisionArgs(['--connector', 'nope', '--name', 'Acme'])).toThrow('Unknown connector "nope" (available: airtable, github, make, n8n, zapier)')
  })
  it('takes exactly one action', () => {
    expect(() => parseProvisionArgs(['--connector', 'airtable'])).toThrow('one of --name, --ref, --list or --upgrade')
    expect(() => parseProvisionArgs(['--connector', 'airtable', '--name', 'Acme', '--ref', 'appAbCdEfGhIjKlMn'])).toThrow('one of')
    expect(() => parseProvisionArgs(['--connector', 'airtable', '--name', '  '])).toThrow('one of')
  })
  it('rejects unknown flags', () => {
    expect(() => parseProvisionArgs(['--connector', 'airtable', '--email', 'a@example.com'])).toThrow()
  })
})
