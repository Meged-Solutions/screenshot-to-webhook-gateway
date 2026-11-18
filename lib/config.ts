/**
 * Gateway runtime configuration. The destination lives in each signed token,
 * and each connector reads its own env vars (see connectors/<id>/index.ts).
 */
export type Config = {
  /** signs and verifies customer tokens; also needed locally by the provision script */
  signingSecret: string
  /** token ids (jti) that must be rejected */
  revokedIds: ReadonlySet<string>
}

export const MIN_SECRET_LENGTH = 32

export function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing required env var ${name}`)
  return value
}

export function signingSecret(env: NodeJS.ProcessEnv): string {
  const secret = required(env, 'WEBHOOK_SIGNING_SECRET')
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`WEBHOOK_SIGNING_SECRET must be at least ${MIN_SECRET_LENGTH} characters`)
  }
  return secret
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    signingSecret: signingSecret(env),
    revokedIds: new Set(
      (env.REVOKED_TOKEN_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  }
}
