/**
 * Pushes the gateway's env vars from .env.local to Vercel production. They
 * apply on the next deployment, which a push to GitHub triggers:
 *
 *   npm run sync-vercel-env
 *
 * Only gateway vars are sent. Provisioning credentials stay local by design. Values travel over stdin, never on the command line or in output.
 */
import { spawnSync } from 'node:child_process'
import { CONNECTORS } from '../connectors/index.js'

const TARGET = 'production'

/** Vars the deployed gateway reads: the core ones plus every connector's gateway vars. Secrets are stored as Vercel Sensitive vars. */
const GATEWAY_VARS = [
  { name: 'WEBHOOK_SIGNING_SECRET', sensitive: true },
  // Sensitive: revoked ids of webhook connectors (Zapier, Make, n8n) contain the hook id.
  { name: 'REVOKED_TOKEN_IDS', sensitive: true },
  ...CONNECTORS.flatMap((c) => c.env.filter((v) => v.scope === 'gateway')),
]

/** Vars the gateway can run without: a connector you do not use needs no env. */
const REQUIRED = new Set<string>(['WEBHOOK_SIGNING_SECRET'])

function vercel(args: string[], input?: string): string {
  const res = spawnSync('vercel', [...args, '--non-interactive'], { input, encoding: 'utf8' })
  if (res.status !== 0) throw new Error(`vercel ${args.slice(0, 2).join(' ')} failed:\n${res.stderr || res.stdout}`)
  return res.stdout + res.stderr
}

function existingNames(): Set<string> {
  const out = vercel(['env', 'ls', TARGET])
  return new Set([...out.matchAll(/^\s+([A-Z][A-Z0-9_]*)\s/gm)].map((m) => m[1]!))
}

function main() {
  const existing = existingNames()
  const missing: string[] = []

  for (const { name, sensitive } of GATEWAY_VARS) {
    const value = process.env[name]?.trim()
    if (!value) {
      missing.push(name)
      continue
    }
    const flag = sensitive ? '--sensitive' : '--no-sensitive'
    if (existing.has(name)) {
      vercel(['env', 'update', name, TARGET, sensitive ? '--sensitive' : '--type=config', '--yes'], value)
      console.log(`updated ${name}`)
    } else {
      vercel(['env', 'add', name, TARGET, flag, '--yes'], value)
      console.log(`added   ${name}`)
    }
  }

  const blocking = missing.filter((n) => REQUIRED.has(n))
  if (blocking.length) {
    throw new Error(`Not synced, empty in .env.local: ${blocking.join(', ')}. The gateway cannot run without them.`)
  }
  const skipped = missing.filter((n) => !REQUIRED.has(n))
  if (skipped.length) console.log(`Skipped (empty in .env.local): ${skipped.join(', ')}`)
  console.log('Synced. Vercel applies env changes on the next deployment: push to GitHub to deploy.')
}

try {
  main()
} catch (err) {
  console.error((err as Error).message)
  process.exit(1)
}
