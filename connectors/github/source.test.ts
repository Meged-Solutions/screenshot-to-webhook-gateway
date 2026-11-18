import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Source files stay plain ASCII, so GitHub shows no hidden or bidirectional Unicode warning. */
describe('github connector source', () => {
  for (const file of ['index.ts', 'api.ts', 'markdown.ts', 'provision.ts']) {
    it(`${file} is printable ASCII`, () => {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8')
      const bad = [...text].flatMap((ch, i) => (/[\t\n\x20-\x7E]/.test(ch) ? [] : [`U+${ch.codePointAt(0)!.toString(16).toUpperCase()} at ${i}`]))
      expect(bad).toEqual([])
    })
  }
})
