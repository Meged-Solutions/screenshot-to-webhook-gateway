import type { Image } from '../lib/payload.js'

/** One report from the extension, parsed from JSON or multipart (see docs/payload.md). */
export type Report = { fields: Record<string, unknown>; image?: Image }

/**
 * An env var a connector reads. `gateway` vars go to Vercel; `provision` vars
 * stay in .env.local. `optional` vars may be left empty without breaking delivery.
 */
export type EnvVar = { name: string; sensitive: boolean; description: string; scope: 'gateway' | 'provision'; optional?: boolean }

/** A delivered report: the id the destination gave it, and payload fields it refused. */
export type Delivered = { id: string; skipped: string[] }

/** The destination refused the report. `id` is set when part of it was saved. */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly id?: string,
  ) {
    super(message)
    this.name = 'DeliveryError'
  }
}

/** A gateway env var the connector needs is missing. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/** Creates destinations from the CLI (npm run provision). Optional. */
export type Provisioner = {
  /** Creates the destination, or reuses one this connector made earlier under the same name. */
  create(name: string, env: NodeJS.ProcessEnv): Promise<{ ref: string; url: string; reused: boolean; notes: string[] }>
  list(env: NodeJS.ProcessEnv): Promise<{ name: string; ref: string; url: string }[]>
  /** Brings every destination up to the current schema. */
  upgrade?(env: NodeJS.ProcessEnv): Promise<{ name: string; changes: string[] }[]>
}

export type Connector = {
  /** Lowercase id, the first part of every token: matches CONNECTOR_ID in lib/token.ts. */
  id: string
  title: string
  env: readonly EnvVar[]
  /** Whether `ref` names a destination of this connector. Must only accept refs matching REF in lib/token.ts. */
  isValidRef(ref: string): boolean
  deliver(report: Report, ref: string, env: NodeJS.ProcessEnv): Promise<Delivered>
  provisioner?: Provisioner
  /** Optional: accept an older token style for this connector. */
  verifyLegacy?(token: string, secret: string, revokedIds: ReadonlySet<string>): { ref: string; id: string } | undefined
}

/** A gateway env var, or a ConfigError naming it (logged, never sent to the caller). */
export function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new ConfigError(`Missing ${name}`)
  return value
}
