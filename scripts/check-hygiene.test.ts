import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findViolations } from './check-hygiene.js'

const rules = (path: string, text: string) => findViolations(path, text).map((v) => v.rule)
/** Made-up real-looking values, built from parts so this file passes its own check. */
const REAL_EMAIL = ['dana', 'acme.io'].join('@')
const REAL_HOST = ['acme-gateway', 'vercel.app'].join('.')
const X_HOST = ['x', 'vercel.app'].join('.')

describe('hygiene check', () => {
  it('example-emails-only', () => {
    expect(rules('a.md', `mail ${REAL_EMAIL}`)).toEqual(['example-emails-only'])
    expect(rules('a.md', 'mail a@example.com or b@example.org or 1+x@users.noreply.github.com')).toEqual([])
    expect(rules('a.md', 'npm i @types/node, git@github.com:x/y')).toEqual([])
  })
  it('placeholder-vercel-url', () => {
    expect(rules('a.md', `https://${REAL_HOST}/api/webhook`)).toEqual(['placeholder-vercel-url'])
    expect(rules('a.md', 'https://your-project.vercel.app/api/webhook')).toEqual([])
    expect(rules('a.test.ts', `https://${X_HOST}/api/webhook`)).toEqual([])
    expect(rules('a.ts', `https://${X_HOST}/api/webhook`)).toEqual(['placeholder-vercel-url'])
  })
  it('reports line numbers and skips only the lockfile and LICENSE', () => {
    expect(findViolations('a.md', `ok\nmail ${REAL_EMAIL}`)).toEqual([{ line: 2, rule: 'example-emails-only' }])
    expect(findViolations('package-lock.json', `mail ${REAL_EMAIL}`)).toEqual([])
    expect(findViolations('LICENSE', REAL_EMAIL)).toEqual([])
  })
  it('scans its own files, which pass', () => {
    for (const path of ['scripts/check-hygiene.ts', 'scripts/check-hygiene.test.ts']) {
      expect(findViolations(path, `mail ${REAL_EMAIL}`), path).toHaveLength(1)
      expect(findViolations(path, readFileSync(path, 'utf8')), path).toEqual([])
    }
  })
})
