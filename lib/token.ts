import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * A bearer token names one destination of one connector:
 *
 *   <connector>.<ref>.<nonce>.<mac>
 *
 * The MAC covers the connector, the ref and the nonce, so a token cannot be
 * edited to reach another connector or destination. The token id
 * (<connector>.<ref>.<nonce>) is what REVOKED_TOKEN_IDS lists; it is not
 * enough to rebuild the token.
 */
export type TokenClaims = { connector: string; ref: string; id: string }

export const CONNECTOR_ID = /^[a-z][a-z0-9-]{0,31}$/
export const REF = /^[A-Za-z0-9_-]{1,128}$/

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const NONCE_LENGTH = 6
const MAC_LENGTH = 22
const NONCE = new RegExp(`^[A-Za-z0-9]{${NONCE_LENGTH}}$`)
const MAC = new RegExp(`^[A-Za-z0-9]{${MAC_LENGTH}}$`)

const mac = (secret: string, id: string) =>
  [...createHmac('sha256', secret).update(`v3:${id}`).digest().subarray(0, MAC_LENGTH)]
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('')

export function issueToken(connector: string, ref: string, secret: string): { token: string; id: string } {
  if (!CONNECTOR_ID.test(connector)) throw new Error(`Invalid connector id "${connector}"`)
  if (!REF.test(ref)) throw new Error(`Invalid destination ref "${ref}"`)
  const nonce = Array.from({ length: NONCE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  const id = `${connector}.${ref}.${nonce}`
  return { token: `${id}.${mac(secret, id)}`, id }
}

/** The claims of a valid, unrevoked token; undefined for anything else, never a throw. */
export function verifyToken(token: string, secret: string, revokedIds: ReadonlySet<string>): TokenClaims | undefined {
  const parts = token.split('.')
  if (parts.length !== 4) return undefined
  const [connector, ref, nonce, given] = parts as [string, string, string, string]
  if (!CONNECTOR_ID.test(connector) || !REF.test(ref) || !NONCE.test(nonce) || !MAC.test(given)) return undefined
  const id = `${connector}.${ref}.${nonce}`
  if (!timingSafeEqual(Buffer.from(given), Buffer.from(mac(secret, id))) || revokedIds.has(id)) return undefined
  return { connector, ref, id }
}

/** The token from an `Authorization: Bearer <token>` header. */
export const bearerOf = (header: string | null): string | undefined => /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1]
