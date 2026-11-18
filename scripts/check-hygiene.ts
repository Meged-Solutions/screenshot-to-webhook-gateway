/**
 * Public-repo hygiene: fails on text that should never be committed here.
 * Runs in CI over every tracked file (npm run check:hygiene).
 *
 * - example-emails-only: real addresses do not belong in a public repo.
 * - placeholder-vercel-url: docs and code use your-project.vercel.app.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export type Violation = { line: number; rule: string }

/** Files the rules do not apply to: generated or legal. */
const SKIP = new Set(['package-lock.json', 'LICENSE'])
const ALLOWED_EMAIL = /@(example\.(com|org)|users\.noreply\.github\.com)$/i
const EMAIL = /(?<![\w@/:])[\w.+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g
const VERCEL_URL = /\b([a-z0-9-]+)\.vercel\.app\b/gi

export function findViolations(path: string, text: string): Violation[] {
  if (SKIP.has(path)) return []
  const isTest = /\.test\.ts$/.test(path)
  const found: Violation[] = []
  text.split('\n').forEach((content, i) => {
    const line = i + 1
    if ([...content.matchAll(EMAIL)].some(([email]) => !ALLOWED_EMAIL.test(email) && !email.startsWith('git@'))) {
      found.push({ line, rule: 'example-emails-only' })
    }
    if ([...content.matchAll(VERCEL_URL)].some(([, sub]) => sub !== 'your-project' && !(isTest && sub === 'x'))) {
      found.push({ line, rule: 'placeholder-vercel-url' })
    }
  })
  return found
}

function main() {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  let count = 0
  for (const path of files) {
    for (const { line, rule } of findViolations(path, readFileSync(path, 'utf8'))) {
      console.error(`${path}:${line}  ${rule}`)
      count++
    }
  }
  if (count) {
    console.error(`\n${count} hygiene violation(s).`)
    process.exit(1)
  }
  console.log(`Hygiene check passed (${files.length} files).`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
