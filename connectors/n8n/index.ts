/**
 * Forwards each report to the production URL of an n8n Webhook node:
 * <N8N_BASE_URL>/webhook/<ref>. The ref is the node's Path. The payload is the
 * shared forward shape in lib/forward.ts.
 */
import { forwardReport } from '../../lib/forward.js'
import type { ContractSample } from '../contract.js'
import { ConfigError, requireEnv, type Connector } from '../types.js'

/** Header the optional shared secret travels in; the Webhook node's Header Auth checks it. */
export const SECRET_HEADER = 'X-Webhook-Secret'

/** n8n's default production endpoint (N8N_ENDPOINT_WEBHOOK). */
const WEBHOOK_ENDPOINT = 'webhook'

/** A single path segment: n8n's generated UUIDs and simple custom paths. No slashes or route params. */
const PATH = /^[A-Za-z0-9_-]{1,128}$/

/** Plain http is only for a local n8n reached from `vercel dev`. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Visible ASCII only, so building the header can never throw an error that quotes the secret. */
const SECRET = /^[\x21-\x7E]+$/

/** n8n's production and test webhook prefixes, which belong after the base URL, not in it. */
const WEBHOOK_SEGMENT = /^webhook(-test)?$/i

/** The validated base URL without a trailing slash. Never echoes the value: it may hold credentials. */
function baseUrl(env: NodeJS.ProcessEnv): string {
  const raw = requireEnv(env, 'N8N_BASE_URL')
  const invalid = (why: string) => new ConfigError(`Invalid N8N_BASE_URL: ${why}`)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw invalid('not an absolute URL')
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
    throw invalid('use https (http is allowed only for localhost)')
  }
  if (url.username || url.password) throw invalid('remove the credentials')
  if (raw.includes('?') || raw.includes('#')) throw invalid('remove the query string or fragment')
  const path = url.pathname.replace(/\/+$/, '')
  if (path.split('/').some((segment) => WEBHOOK_SEGMENT.test(segment))) throw invalid('use the instance URL, without /webhook')
  return `${url.origin}${path}`
}

export const n8n: Connector = {
  id: 'n8n',
  title: 'n8n',
  env: [
    {
      name: 'N8N_BASE_URL',
      sensitive: false,
      scope: 'gateway',
      description: 'Your n8n instance URL, such as https://n8n.example.com (https only, no /webhook, no query)',
    },
    {
      name: 'N8N_WEBHOOK_SECRET',
      sensitive: true,
      scope: 'gateway',
      optional: true,
      description: `Optional, recommended: visible ASCII, no spaces. Sent as the ${SECRET_HEADER} header; require it with Header Auth on the Webhook node`,
    },
  ],

  isValidRef: (ref) => PATH.test(ref),

  async deliver(report, ref, env) {
    const url = `${baseUrl(env)}/${WEBHOOK_ENDPOINT}/${encodeURIComponent(ref)}`
    const secret = env.N8N_WEBHOOK_SECRET?.trim()
    if (secret && !SECRET.test(secret)) throw new ConfigError('Invalid N8N_WEBHOOK_SECRET')
    return forwardReport(url, report, { headers: secret ? { [SECRET_HEADER]: secret } : {} })
  },
}

/** Used by the shared contract tests. */
export const contractSample: ContractSample = {
  validRef: '0b6c1f9e-3d2a-4c8b-9e7f-5a1d2c3b4e6f',
  invalidRefs: ['team/bugs', '/bugs', ':id', 'https://n8n.example.com/webhook/bugs', 'bugs?x=1'],
}
