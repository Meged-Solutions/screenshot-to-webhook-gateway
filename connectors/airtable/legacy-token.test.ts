import { createHmac, randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyLegacyShortToken } from './legacy-token.js'

const S = 'a'.repeat(32)
const BASE = 'appAbCdEfGhIjKlMn'
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** The 32-character tokens issued before connector-prefixed tokens, as the old issuer built them. */
function issueShortToken(baseId: string, secret: string) {
  const nonce = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  const id = `${baseId}${nonce}`
  const mac = [...createHmac('sha256', secret).update(`v2:${id}`).digest().subarray(0, 11)].map((b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${id}${mac}`
}

describe('legacy short token', () => {
  it('legacy short token resolves and revokes', () => {
    const token = issueShortToken(BASE, S)
    expect(token).toHaveLength(32)
    expect(verifyLegacyShortToken(token, S, new Set())).toEqual({ ref: BASE, id: token.slice(0, 21) })
    expect(verifyLegacyShortToken(token, S, new Set([token.slice(0, 21)]))).toBeUndefined()
  })
  it('rejects a wrong secret, an edited base, a bad mac and wrong lengths', () => {
    const token = issueShortToken(BASE, S)
    expect(verifyLegacyShortToken(token, 'b'.repeat(32), new Set())).toBeUndefined()
    expect(verifyLegacyShortToken(`appZzZzZzZzZzZzZz${token.slice(17)}`, S, new Set())).toBeUndefined()
    expect(verifyLegacyShortToken(`${token.slice(0, 31)}${token.endsWith('x') ? 'y' : 'x'}`, S, new Set())).toBeUndefined()
    expect(verifyLegacyShortToken(token.slice(1), S, new Set())).toBeUndefined()
    expect(verifyLegacyShortToken(`airtable.${BASE}.abcdef.${'a'.repeat(22)}`, S, new Set())).toBeUndefined()
  })
})
