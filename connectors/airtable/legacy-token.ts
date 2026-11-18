import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifies the 32-character Airtable tokens issued before connector-prefixed
 * tokens: the base id (17), a nonce (4) and a truncated HMAC over both (11).
 * Kept so deployments that issued them keep working; new tokens are never
 * issued in this format. The revocation id is the first 21 characters.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const BASE_ID_LENGTH = 17
const NONCE_LENGTH = 4
const MAC_LENGTH = 11
const SHORT_TOKEN = new RegExp(`^app[A-Za-z0-9]{${BASE_ID_LENGTH - 3}}[A-Za-z0-9]{${NONCE_LENGTH + MAC_LENGTH}}$`)

const mac = (secret: string, signed: string) =>
  [...createHmac('sha256', secret).update(`v2:${signed}`).digest().subarray(0, MAC_LENGTH)]
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('')

export function verifyLegacyShortToken(
  token: string,
  secret: string,
  revokedIds: ReadonlySet<string>,
): { ref: string; id: string } | undefined {
  if (!SHORT_TOKEN.test(token)) return undefined
  const id = token.slice(0, BASE_ID_LENGTH + NONCE_LENGTH)
  if (!timingSafeEqual(Buffer.from(token.slice(id.length)), Buffer.from(mac(secret, id))) || revokedIds.has(id)) return undefined
  return { ref: id.slice(0, BASE_ID_LENGTH), id }
}
