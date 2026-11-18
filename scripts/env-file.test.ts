import { describe, expect, it } from 'vitest'
import { ensureSigningSecret, generatedSecretWarning, readEnv, setEnvValue } from './env-file.js'

const sample = '# comment\nWEBHOOK_SIGNING_SECRET=\n# AIRTABLE_PAT=commented\nAIRTABLE_PAT=pat123\nWEBHOOK_URL="https://your-project.vercel.app/api/webhook"\n'

describe('env file', () => {
  it('reads values, skipping comments and quotes', () => {
    expect(readEnv(sample)).toEqual({ WEBHOOK_SIGNING_SECRET: '', AIRTABLE_PAT: 'pat123', WEBHOOK_URL: 'https://your-project.vercel.app/api/webhook' })
  })
  it('replaces a value in place and keeps every other line', () => {
    const out = setEnvValue(sample, 'AIRTABLE_PAT', 'new')
    expect(out).toBe(sample.replace('AIRTABLE_PAT=pat123', 'AIRTABLE_PAT=new'))
  })
  it('appends a missing name, never touching commented lines', () => {
    expect(setEnvValue('# X=1\n', 'X', '2')).toBe('# X=1\nX=2\n')
    expect(setEnvValue('A=1', 'B', '2')).toBe('A=1\nB=2\n')
  })
  it('fills only empty signing secret', () => {
    const { text, generated } = ensureSigningSecret(sample)
    expect(generated).toBe(true)
    expect(readEnv(text).WEBHOOK_SIGNING_SECRET).toMatch(/^[0-9a-f]{64}$/)
    expect(text.split('\n').filter((l) => !l.startsWith('WEBHOOK_SIGNING_SECRET='))).toEqual(sample.split('\n').filter((l) => !l.startsWith('WEBHOOK_SIGNING_SECRET=')))
    const again = ensureSigningSecret(text)
    expect(again).toEqual({ text, generated: false })
  })
})

describe('generated secret warning', () => {
  it('warns when a Vercel project is already linked, since its secret must match', () => {
    expect(generatedSecretWarning(true)).toMatch(/same WEBHOOK_SIGNING_SECRET as Vercel/)
    expect(generatedSecretWarning(false)).toBeUndefined()
  })
})
