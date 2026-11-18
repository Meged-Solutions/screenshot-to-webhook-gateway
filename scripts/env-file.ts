import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'

/** Parses a .env file with Node's own parser (comments and quotes handled). */
export const readEnv = (text: string): Record<string, string> => ({ ...parseEnv(text) }) as Record<string, string>

/** Sets NAME=value on its existing line, or appends it; every other line is kept as is. */
export function setEnvValue(text: string, name: string, value: string): string {
  const line = new RegExp(`^${name}=.*$`, 'm')
  if (line.test(text)) return text.replace(line, `${name}=${value}`)
  return `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${name}=${value}\n`
}

/** Generates WEBHOOK_SIGNING_SECRET when it is empty or missing; an existing secret is never replaced. */
export function ensureSigningSecret(text: string): { text: string; generated: boolean } {
  if (readEnv(text).WEBHOOK_SIGNING_SECRET?.trim()) return { text, generated: false }
  return { text: setEnvValue(text, 'WEBHOOK_SIGNING_SECRET', randomBytes(32).toString('hex')), generated: true }
}

/**
 * Tokens are signed locally and verified on Vercel, so both must hold the same
 * secret. A secret generated after the project was deployed (for example with
 * the Deploy button) will not match the one Vercel has.
 */
export function generatedSecretWarning(vercelLinked: boolean): string | undefined {
  if (!vercelLinked) return undefined
  return (
    'Warning: this project is already linked to Vercel. Tokens only work if .env.local has the same WEBHOOK_SIGNING_SECRET as Vercel. ' +
    'Paste the secret you gave Vercel into .env.local, or run npm run sync-vercel-env and redeploy to use the new one.'
  )
}
