/**
 * First-run check: creates .env.local from .env.example, generates the signing
 * secret, and reports which settings are still missing. It never prints a
 * value, so it is safe to run inside an AI agent session.
 *
 *   npm run setup
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { CONNECTORS } from '../connectors/index.js'
import { ensureSigningSecret, generatedSecretWarning, readEnv } from './env-file.js'

const ENV_FILE = '.env.local'
const MIN_NODE = 24

function main() {
  const major = Number(process.versions.node.split('.')[0])
  if (major < MIN_NODE) throw new Error(`Node ${MIN_NODE} or later is required (found ${process.versions.node})`)

  if (!existsSync(ENV_FILE)) {
    copyFileSync('.env.example', ENV_FILE)
    console.log(`Created ${ENV_FILE} from .env.example`)
  }
  const { text, generated } = ensureSigningSecret(readFileSync(ENV_FILE, 'utf8'))
  if (generated) {
    writeFileSync(ENV_FILE, text)
    console.log('Generated WEBHOOK_SIGNING_SECRET')
    const warning = generatedSecretWarning(existsSync('.vercel/project.json'))
    if (warning) console.warn(warning)
  }
  chmodSync(ENV_FILE, 0o600) // secrets: readable by you only

  const env = readEnv(text)
  const status = (name: string, optional = false) => {
    const value = env[name]?.trim()
    const placeholder = value?.includes('your-project')
    return value && !placeholder ? 'set' : optional ? 'optional' : 'missing'
  }
  const rows: [string, string][] = [
    ['WEBHOOK_SIGNING_SECRET', status('WEBHOOK_SIGNING_SECRET')],
    ['REVOKED_TOKEN_IDS', status('REVOKED_TOKEN_IDS', true)],
    ['WEBHOOK_URL', status('WEBHOOK_URL')],
  ]
  for (const c of CONNECTORS) for (const v of c.env) rows.push([`${v.name} (${c.title}, ${v.scope})`, status(v.name)])
  console.log(`\n${ENV_FILE}:`)
  for (const [name, state] of rows) console.log(`  ${state.padEnd(8)} ${name}`)

  const vercel = spawnSync('vercel', ['--version'], { encoding: 'utf8' })
  const linked = existsSync('.vercel/project.json')
  console.log(`\nVercel CLI: ${vercel.status === 0 ? 'installed' : 'not found (npm i -g vercel)'}`)
  console.log(`Vercel project: ${linked ? 'linked' : 'not linked (vercel link)'}`)

  const missing = rows.filter(([, s]) => s === 'missing').map(([n]) => n.split(' ')[0]!)
  console.log('\nNext:')
  if (missing.length) console.log(`  Fill in ${missing.join(', ')} in ${ENV_FILE} (see the comments there).`)
  if (!linked) console.log('  Run `vercel link`, or deploy with the button in README.md.')
  console.log('  Then: npm run sync-vercel-env, deploy, and npm run provision -- --connector airtable --name "<name>"')
}

try {
  main()
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}
