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
import { setupReport } from './setup-report.js'

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

  const report = setupReport(readEnv(text), CONNECTORS)
  console.log(`\n${ENV_FILE}:`)
  for (const { name, state } of report.core) console.log(`  ${state.padEnd(10)} ${name}`)
  console.log('\nConnectors (configure the ones you use):')
  for (const c of report.connectors) {
    const detail = c.state === 'incomplete' ? ` (missing ${c.missing.join(', ')})` : c.state === 'unused' ? ' (not configured)' : ''
    console.log(`  ${c.state.padEnd(10)} ${c.title} [${c.id}]${detail}`)
  }

  const vercel = spawnSync('vercel', ['--version'], { encoding: 'utf8' })
  const linked = existsSync('.vercel/project.json')
  console.log(`\nVercel CLI: ${vercel.status === 0 ? 'installed' : 'not found (npm i -g vercel)'}`)
  console.log(`Vercel project: ${linked ? 'linked' : 'not linked (vercel link)'}`)

  console.log('\nNext:')
  if (report.toFill.length) console.log(`  Fill in ${report.toFill.join(', ')} in ${ENV_FILE} (see the comments there).`)
  if (!linked) console.log('  Run `vercel link`, or deploy with the button in README.md.')
  console.log('  Then: npm run sync-vercel-env, deploy, and npm run provision -- --connector <id> (--name "<name>" | --ref <id>)')
}

try {
  main()
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}
