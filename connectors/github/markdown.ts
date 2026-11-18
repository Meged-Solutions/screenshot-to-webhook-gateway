/**
 * Turns report fields into a GitHub issue title and Markdown body.
 *
 * Every value comes from whoever used the extension on some web page, so it is
 * untrusted: it must not ping people, link issues or URLs, inject HTML, or
 * break out of the Markdown structure built here.
 */

/** Zero-width space: GitHub stops reading a mention, reference or autolink at it. */
const ZW = '​'

/** GitHub's limit for an issue title. */
const MAX_TITLE = 256
/** Per-field caps keep the worst-case body (escaping can triple it) under GitHub's 65,536 characters. */
const MAX_NOTE = 12_000
const MAX_PINS = 4_000
const MAX_LINE = 300

/** Control characters other than newline and tab, plus bidi overrides that can disguise text. */
const UNSAFE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F؜‎‏‪-‮⁦-⁩]/g

/** Characters that start Markdown or HTML structure; each is backslash-escaped. */
const MARKDOWN_CHARS = /[\\`*_{}[\]()<>#+\-.!|~&=$]/g

const clean = (text: string) => text.replace(/\r\n?/g, '\n').replace(UNSAFE_CHARS, '')

/** Breaks @mentions (and emails), #123 / GH-123 references and autolinked URLs. */
const neutralize = (text: string) =>
  text
    .replace(/@(?=[A-Za-z0-9_-])/g, `@${ZW}`)
    .replace(/#(?=\d)/g, `#${ZW}`)
    .replace(/\b(gh)-(?=\d)/gi, `$1${ZW}-`)
    .replace(/:\/\//g, `:${ZW}//`)
    .replace(/\b(www)\./gi, `$1${ZW}.`)

/** Cuts text to `max` characters; `more` says whether anything was cut (marked after escaping). */
const cut = (text: string, max: number) => {
  const chars = Array.from(text)
  return chars.length > max ? { text: chars.slice(0, max).join(''), more: true } : { text, more: false }
}
const mark = (more: boolean) => (more ? ' (truncated)' : '')

/** Text for places GitHub does not render as Markdown, such as the title. */
export const plainText = (text: string) => neutralize(clean(text))

/** Text that renders literally inside a Markdown paragraph. */
export const safeMarkdown = (text: string) => neutralize(clean(text)).replace(MARKDOWN_CHARS, '\\$&')

/** A report value as text; empty for null, undefined and blank strings. */
function textOf(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** A report value as one trimmed line without control characters; also used for the label. */
export const oneLine = (value: unknown) => clean(textOf(value)).replace(/\s+/g, ' ').trim()

function hostOf(url: unknown): string {
  try {
    return new URL(textOf(url)).host
  } catch {
    return ''
  }
}

/** The note's first line, else the page title, else "Feedback from <host>". */
export function issueTitle(fields: Record<string, unknown>): string {
  const firstLine = clean(textOf(fields.note))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .find(Boolean)
  const host = hostOf(fields.pageUrl)
  const title = firstLine || oneLine(fields.pageTitle) || (host ? `Feedback from ${host}` : 'Feedback')
  return Array.from(plainText(title)).slice(0, MAX_TITLE).join('')
}

/** A multi-line value as a blockquote; each line is escaped, so it cannot end the quote. */
function quote(value: unknown, max: number): string {
  const { text, more } = cut(clean(textOf(value)).trim(), max)
  if (!text) return ''
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .map((line) => (line ? `> ${safeMarkdown(line)}` : '>'))
  return `${lines.join('\n')}${mark(more)}`
}

/** A single-line value as a code span: nothing inside renders, links or pings. */
function codeSpan(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longestRun + 1)
  return text.includes('`') ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`
}

const DETAILS: [label: string, key: string][] = [
  ['Page title', 'pageTitle'],
  ['Captured at', 'capturedAt'],
  ['Browser', 'browser'],
  ['OS', 'os'],
  ['Screen', 'screen'],
  ['Viewport', 'viewport'],
  ['Pins', 'pinCount'],
  ['Reporter', 'reporter'],
  ['Tag', 'tag'],
]

export function issueBody(fields: Record<string, unknown>, opts: { imageLeftOut: boolean }): string {
  const sections: string[] = []
  const note = quote(fields.note, MAX_NOTE)
  sections.push(note || '_No note._')

  const details: string[] = []
  const pageUrl = cut(oneLine(fields.pageUrl), MAX_LINE)
  if (pageUrl.text) details.push(`- **Page URL:** ${codeSpan(pageUrl.text)}${mark(pageUrl.more)}`)
  for (const [label, key] of DETAILS) {
    const value = cut(oneLine(fields[key]), MAX_LINE)
    if (value.text) details.push(`- **${label}:** ${safeMarkdown(value.text)}${mark(value.more)}`)
  }
  if (details.length) sections.push(`### Details\n\n${details.join('\n')}`)

  const pins = quote(fields.pinsText, MAX_PINS)
  if (pins) sections.push(`### Pins\n\n${pins}`)

  if (opts.imageLeftOut) {
    sections.push('_The screenshot was not attached: the GitHub API cannot upload issue attachments._')
  }
  return `${sections.join('\n\n')}\n`
}
