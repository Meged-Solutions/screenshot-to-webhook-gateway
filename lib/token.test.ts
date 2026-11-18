import { describe, expect, it } from 'vitest'
import { bearerOf, issueToken, verifyToken } from './token.js'

const S = 'a'.repeat(32)
const none = new Set<string>()
const REF = 'appAbCdEfGhIjKlMn'

describe('connector token', () => {
  it('round-trips', () => {
    const { token, id } = issueToken('airtable', REF, S)
    expect(token).toMatch(/^airtable\.appAbCdEfGhIjKlMn\.[A-Za-z0-9]{6}\.[A-Za-z0-9]{22}$/)
    expect(id).toBe(token.split('.').slice(0, 3).join('.'))
    expect(verifyToken(token, S, none)).toEqual({ connector: 'airtable', ref: REF, id })
  })

  it('cannot be retargeted', () => {
    const [, , nonce, mac] = issueToken('airtable', REF, S).token.split('.')
    expect(verifyToken(`notion.${REF}.${nonce}.${mac}`, S, none)).toBeUndefined()
    expect(verifyToken(`airtable.appZzZzZzZzZzZzZz.${nonce}.${mac}`, S, none)).toBeUndefined()
  })

  it('rejects wrong secret and revoked id', () => {
    const { token, id } = issueToken('airtable', REF, S)
    expect(verifyToken(token, 'b'.repeat(32), none)).toBeUndefined()
    expect(verifyToken(token, S, new Set([id]))).toBeUndefined()
  })

  it('rejects malformed shapes', () => {
    const { token } = issueToken('airtable', REF, S)
    const bad = ['', 'a.b.c', 'airtable..x.y', `${token}.x`, `airtable.${'x'.repeat(129)}.abcdef.${'a'.repeat(22)}`, token.replace('airtable', 'Airtable'), `${token}\n`, token.slice(0, -1)]
    for (const t of bad) expect(() => verifyToken(t, S, none)).not.toThrow()
    for (const t of bad) expect(verifyToken(t, S, none)).toBeUndefined()
  })

  it('issue refuses bad input', () => {
    expect(() => issueToken('Air table', 'x', S)).toThrow()
    expect(() => issueToken('airtable', 'a.b', S)).toThrow()
    expect(() => issueToken('airtable', '', S)).toThrow()
  })
})

describe('bearerOf', () => {
  it('extracts the token', () => {
    expect(bearerOf('Bearer abc')).toBe('abc')
    expect(bearerOf('bearer  abc')).toBe('abc')
    expect(bearerOf(null)).toBeUndefined()
    expect(bearerOf('Basic x')).toBeUndefined()
  })
})
