import { describe, expect, it } from 'vitest'
import { issueBody, issueTitle, plainText, safeMarkdown } from './markdown.js'

const ZW = '\u200B'

describe('plainText', () => {
  it('strips control and invisible format characters', () => {
    expect(plainText('a\u0000b\u0007c\u202Ed\u2066e')).toBe('abcde')
  })
  it('breaks @mentions, issue references and autolinks', () => {
    expect(plainText('ping @octocat and @org/team')).toBe(`ping @${ZW}octocat and @${ZW}org/team`)
    expect(plainText('see #12, gh-34, GH-5 and other/repo#6')).toBe(`see #${ZW}12, gh${ZW}-34, GH${ZW}-5 and other/repo#${ZW}6`)
    expect(plainText('go to https://evil.example.com or www.evil.example.com')).toBe(
      `go to https:${ZW}//evil.example.com or www${ZW}.evil.example.com`,
    )
    expect(plainText('mail a@example.com')).toBe(`mail a@${ZW}example.com`)
  })
  it('leaves ordinary text alone', () => {
    expect(plainText('Button overlaps footer # 3 at 50%')).toBe('Button overlaps footer # 3 at 50%')
  })
})

describe('safeMarkdown', () => {
  it('escapes Markdown and HTML so user text cannot add structure', () => {
    expect(safeMarkdown('<img src=x onerror=alert(1)>')).toBe('\\<img src\\=x onerror\\=alert\\(1\\)\\>')
    expect(safeMarkdown('[click](javascript:x) **bold** `code` | cell ~~s~~ $x$')).toBe(
      '\\[click\\]\\(javascript:x\\) \\*\\*bold\\*\\* \\`code\\` \\| cell \\~\\~s\\~\\~ \\$x\\$',
    )
    expect(safeMarkdown('# heading')).toBe('\\# heading')
    expect(safeMarkdown('&#64;octocat')).toBe(`\\&\\#${ZW}64;octocat`)
    expect(safeMarkdown('back\\slash')).toBe('back\\\\slash')
  })
  it('neutralizes mentions and references after escaping', () => {
    expect(safeMarkdown('@octocat #7')).toBe(`@${ZW}octocat \\#${ZW}7`)
  })
})

describe('issueTitle', () => {
  it('uses the first non-empty line of the note', () => {
    expect(issueTitle({ note: '\n  Button overlaps footer  \nOnly on mobile', pageTitle: 'Settings' })).toBe('Button overlaps footer')
  })
  it('falls back to the page title, then the page host', () => {
    expect(issueTitle({ note: '   ', pageTitle: 'Settings' })).toBe('Settings')
    expect(issueTitle({ pageUrl: 'https://app.example.com/a?b=1' })).toBe('Feedback from app.example.com')
    expect(issueTitle({ pageUrl: 'not a url' })).toBe('Feedback')
    expect(issueTitle({})).toBe('Feedback')
  })
  it('is one neutralized line of at most 256 characters', () => {
    expect(issueTitle({ note: 'hi @octocat\tabout #12' })).toBe(`hi @${ZW}octocat about #${ZW}12`)
    expect(Array.from(issueTitle({ note: 'x'.repeat(400) }))).toHaveLength(256)
  })
})

describe('issueBody', () => {
  const report = {
    note: 'Button overlaps footer\nOnly on mobile\n- [ ] not a task',
    pageUrl: 'https://example.com/settings',
    pageTitle: 'Settings',
    capturedAt: '2026-01-02T03:04:05Z',
    browser: 'Chrome 140',
    os: 'macOS',
    screen: '1920x1080',
    viewport: '1280x720',
    pinsText: '1. misaligned\n2. wrong color',
    reporter: 'Dana',
    tag: 'Bug',
  }

  it('quotes the note and lists the details', () => {
    const body = issueBody(report, { imageLeftOut: false })
    expect(body).toContain('> Button overlaps footer\n> Only on mobile\n> \\- \\[ \\] not a task')
    expect(body).toContain('- **Page URL:** `https://example.com/settings`')
    expect(body).toContain('- **Page title:** Settings')
    expect(body).toContain('- **Captured at:** 2026\\-01\\-02T03:04:05Z')
    expect(body).toContain('- **Browser:** Chrome 140')
    expect(body).toContain('- **OS:** macOS')
    expect(body).toContain('- **Screen:** 1920x1080')
    expect(body).toContain('- **Viewport:** 1280x720')
    expect(body).toContain('- **Reporter:** Dana')
    expect(body).toContain('- **Tag:** Bug')
    expect(body).toContain('> 1\\. misaligned\n> 2\\. wrong color')
    expect(body).not.toContain('screenshot')
  })

  it('says when the screenshot was left out', () => {
    expect(issueBody(report, { imageLeftOut: true })).toMatch(/screenshot was not attached/i)
  })

  it('keeps single-line fields on one line so they cannot start new blocks', () => {
    const body = issueBody({ reporter: 'Dana\n# Owned\n<script>', pageTitle: 'A\r\n> quote' }, { imageLeftOut: false })
    expect(body).toContain('- **Reporter:** Dana \\# Owned \\<script\\>')
    expect(body).toContain('- **Page title:** A \\> quote')
  })

  it('fences the page URL even when it contains backticks', () => {
    const body = issueBody({ pageUrl: 'https://example.com/`x``y' }, { imageLeftOut: false })
    expect(body).toContain('- **Page URL:** ``` https://example.com/`x``y ```')
  })

  it('never lets the note close its quote, ping, or reference', () => {
    const body = issueBody({ note: 'hi\n\n@octocat fixes #1\n    indented code' }, { imageLeftOut: false })
    expect(body).toContain(`> hi\n>\n> @${ZW}octocat fixes \\#${ZW}1\n> indented code`)
    expect(body).not.toMatch(/(^|[^@])@octocat/)
  })

  it('omits empty details and stringifies non-string values', () => {
    const body = issueBody({ note: 'x', pinCount: 3, browser: '', os: null }, { imageLeftOut: false })
    expect(body).toContain('- **Pins:** 3')
    expect(body).not.toContain('Browser')
    expect(body).not.toContain('OS')
  })

  it('stays under the GitHub body limit for huge input', () => {
    const huge = '@'.repeat(100_000)
    const body = issueBody({ note: huge, pinsText: huge, reporter: huge, pageTitle: huge, browser: huge }, { imageLeftOut: true })
    expect(body.length).toBeLessThan(65_536)
    expect(body).toContain('(truncated)')
  })
})
