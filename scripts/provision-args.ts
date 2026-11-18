import { parseArgs } from 'node:util'
import { CONNECTORS, getConnector } from '../connectors/index.js'

export type ProvisionArgs =
  | { connector: string; mode: 'create'; name: string }
  | { connector: string; mode: 'token'; ref: string }
  | { connector: string; mode: 'list' | 'upgrade' }

const available = () => CONNECTORS.map((c) => c.id).join(', ')

export function parseProvisionArgs(argv: string[]): ProvisionArgs {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      connector: { type: 'string' },
      name: { type: 'string' },
      ref: { type: 'string' },
      list: { type: 'boolean' },
      upgrade: { type: 'boolean' },
    },
  })
  const connector = values.connector?.trim()
  if (!connector) throw new Error(`--connector is required (available: ${available()})`)
  if (!getConnector(connector)) throw new Error(`Unknown connector "${connector}" (available: ${available()})`)

  const name = values.name?.trim()
  const ref = values.ref?.trim()
  const actions = [name, ref, values.list, values.upgrade].filter(Boolean)
  if (actions.length !== 1) throw new Error('Pass exactly one of --name, --ref, --list or --upgrade')
  if (name) return { connector, mode: 'create', name }
  if (ref) return { connector, mode: 'token', ref }
  return { connector, mode: values.list ? 'list' : 'upgrade' }
}
