/**
 * Creates destinations and issues bearer tokens for the extension. Runs
 * locally only: provisioning credentials must never reach the deployed gateway.
 *
 *   npm run provision -- --connector airtable --name "Acme"     create or reuse a destination, issue a token
 *   npm run provision -- --connector airtable --ref app...      issue a token for an existing destination
 *   npm run provision -- --connector airtable --list            destinations this tool created
 *   npm run provision -- --connector airtable --upgrade         bring every destination up to the current schema
 *
 * Each token run issues a new token; earlier tokens stay valid until their id
 * is added to REVOKED_TOKEN_IDS.
 */
import { getConnector } from '../connectors/index.js'
import { required, signingSecret } from '../lib/config.js'
import { issueToken } from '../lib/token.js'
import { parseProvisionArgs } from './provision-args.js'

async function main() {
  const args = parseProvisionArgs(process.argv.slice(2))
  const connector = getConnector(args.connector)!
  const env = process.env
  const { provisioner } = connector

  if (args.mode !== 'token' && !provisioner) {
    throw new Error(`The ${connector.title} connector cannot create destinations. Issue a token with --ref <destination id>.`)
  }

  if (args.mode === 'list') {
    const items = await provisioner!.list(env)
    if (!items.length) console.log('No destinations yet.')
    for (const { name, url } of items) console.log(`${name.padEnd(40)}  ${url}`)
    return
  }

  if (args.mode === 'upgrade') {
    if (!provisioner!.upgrade) throw new Error(`The ${connector.title} connector has nothing to upgrade.`)
    const results = await provisioner!.upgrade(env)
    if (!results.length) console.log('No destinations yet.')
    for (const { name, changes } of results) console.log(`${name.padEnd(40)}  ${changes.length ? changes.join(', ') : 'schema already complete'}`)
    return
  }

  // Check gateway-side settings before creating anything.
  const secret = signingSecret(env)
  const webhookUrl = required(env, 'WEBHOOK_URL')

  let ref: string
  let url: string | undefined
  if (args.mode === 'create') {
    const created = await provisioner!.create(args.name, env)
    ref = created.ref
    url = created.url
    console.log(`${created.reused ? 'Reusing' : 'Created'} ${url}${created.notes.length ? ` (${created.notes.join(', ')})` : ''}`)
  } else if (args.mode === 'token') {
    if (!connector.isValidRef(args.ref)) throw new Error(`"${args.ref}" is not a valid ${connector.title} destination id`)
    ref = args.ref
  } else {
    return
  }

  const { token, id } = issueToken(connector.id, ref, secret)
  console.log(`
Connector:    ${connector.title}
Destination:  ${url ?? ref}
Token id:     ${id}   (add to REVOKED_TOKEN_IDS to revoke)

Paste into the Screenshot to Webhook - Annotate & Send extension (auth: Bearer):
Webhook URL:  ${webhookUrl}
Bearer token: ${token}

This token is not stored anywhere. Copy it now. If it is lost, run this again to issue a new one and revoke the old id.
`)
}

main().catch((err: unknown) => {
  console.error((err as Error).message)
  process.exit(1)
})
