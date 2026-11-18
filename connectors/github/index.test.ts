import { afterEach, describe, expect, it, vi } from 'vitest'
import { runConnectorContract } from '../contract.js'
import { ConfigError, DeliveryError, type Report } from '../types.js'
import { contractSample, github } from './index.js'

runConnectorContract(github, contractSample)

const env = { GITHUB_TOKEN: 'test-token' }
const REPO = { id: 123456789, full_name: 'example-org/example-repo', html_url: 'https://github.com/example-org/example-repo' }
const ISSUE = { number: 42, html_url: 'https://github.com/example-org/example-repo/issues/42', labels: [{ name: 'Bug' }] }

type Call = [string, RequestInit]

/** A fetch stub answering each call with the next response. */
function stubFetch(...responses: Response[]) {
  const fetch = vi.fn(async (..._args: unknown[]) => {
    const next = responses.shift()
    if (!next) throw new Error('unexpected fetch')
    return next
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, call: (i: number) => fetch.mock.calls[i] as unknown as Call }
}

const json = (body: unknown, status = 200) => Response.json(body, { status })
const bodyOf = (call: Call) => JSON.parse(call[1].body as string) as { title: string; body: string; labels?: string[] }

const LABEL = { name: 'Bug' }
/** Every GitHub call must time out and refuse redirects. */
const expectSafeInit = (init: RequestInit) => {
  expect(init.redirect).toBe('error')
  expect(init.signal).toBeInstanceOf(AbortSignal)
}

describe('github connector', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('accepts numeric repository ids only', () => {
    expect(github.isValidRef('1')).toBe(true)
    expect(github.isValidRef('123456789')).toBe(true)
    for (const ref of ['0', '0123', 'example-org/example-repo', 'example-repo', '12a', '1'.repeat(21)]) {
      expect(github.isValidRef(ref), ref).toBe(false)
    }
  })

  it('refuses an invalid ref before any network call', async () => {
    const { fetch } = stubFetch()
    await expect(github.deliver({ fields: { note: 'x' } }, '../x', env)).rejects.toBeInstanceOf(DeliveryError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('resolves the repository, checks the label exists, then creates the issue with the recommended headers', async () => {
    const { fetch, call } = stubFetch(json(REPO), json(LABEL), json(ISSUE, 201))
    const report: Report = { fields: { note: 'Button overlaps footer\nOnly on mobile', pageUrl: 'https://example.com/settings', tag: 'Bug' } }
    const result = await github.deliver(report, '123456789', env)

    expect(result).toEqual({ id: '#42', skipped: [] })
    expect(fetch).toHaveBeenCalledTimes(3)

    const [repoUrl, repoInit] = call(0)
    expect(repoUrl).toBe('https://api.github.com/repositories/123456789')
    expect(repoInit.method ?? 'GET').toBe('GET')

    const [labelUrl, labelInit] = call(1)
    expect(labelUrl).toBe('https://api.github.com/repos/example-org/example-repo/labels/Bug')
    expect(labelInit.method ?? 'GET').toBe('GET')

    const [url, init] = call(2)
    expect(url).toBe('https://api.github.com/repos/example-org/example-repo/issues')
    expect(init.method).toBe('POST')
    for (const i of [repoInit, labelInit, init]) {
      expectSafeInit(i)
      expect(i.headers).toMatchObject({
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer test-token',
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'screenshot-to-webhook-gateway',
      })
    }
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    const sent = bodyOf(call(2))
    expect(sent.title).toBe('Button overlaps footer')
    expect(sent.labels).toEqual(['Bug'])
    expect(sent.body).toContain('> Button overlaps footer\n> Only on mobile')
    expect(sent.body).toContain('`https://example.com/settings`')
  })

  it('sends no labels and checks none when there is no tag', async () => {
    const { fetch, call } = stubFetch(json(REPO), json({ ...ISSUE, labels: [] }, 201))
    const result = await github.deliver({ fields: { note: 'x', tag: '  ' } }, '123456789', env)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(bodyOf(call(1))).not.toHaveProperty('labels')
    expect(result.skipped).toEqual([])
  })

  it('uses the existing label name as GitHub spells it', async () => {
    const { call } = stubFetch(json(REPO), json({ name: 'Bug' }), json(ISSUE, 201))
    const result = await github.deliver({ fields: { note: 'x', tag: 'bug' } }, '123456789', env)
    expect(bodyOf(call(2)).labels).toEqual(['Bug'])
    expect(result.skipped).toEqual([])
  })

  it('cuts the tag to 50 characters and encodes it in the label lookup', async () => {
    const tag = `a b/c?${'x'.repeat(60)}`
    const { call } = stubFetch(json(REPO), json({ message: 'Not Found' }, 404), json({ ...ISSUE, labels: [] }, 201))
    await github.deliver({ fields: { note: 'x', tag } }, '123456789', env)
    expect(call(1)[0]).toBe(`https://api.github.com/repos/example-org/example-repo/labels/${encodeURIComponent(tag.slice(0, 50))}`)
  })

  it('never creates labels: a tag without a matching label is left out and reported as skipped', async () => {
    const { fetch, call } = stubFetch(json(REPO), json({ message: 'Not Found' }, 404), json({ ...ISSUE, labels: [] }, 201))
    const result = await github.deliver({ fields: { note: 'x', tag: 'deploy' } }, '123456789', env)
    expect(result).toEqual({ id: '#42', skipped: ['tag'] })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(bodyOf(call(2))).not.toHaveProperty('labels')
    expect(bodyOf(call(2)).body).toContain('**Tag:** deploy')
  })

  it('treats a failed label lookup as not applied, never failing the report', async () => {
    for (const lookup of [json({}, 500), json({}, 403)]) {
      const { call } = stubFetch(json(REPO), lookup, json({ ...ISSUE, labels: [] }, 201))
      const result = await github.deliver({ fields: { note: 'x', tag: 'Bug' } }, '123456789', env)
      expect(result.skipped).toEqual(['tag'])
      expect(bodyOf(call(2))).not.toHaveProperty('labels')
      vi.unstubAllGlobals()
    }
  })

  it('treats a label lookup that throws as not applied', async () => {
    let n = 0
    const fetch = vi.fn(async (..._args: unknown[]) => {
      n++
      if (n === 1) return json(REPO)
      if (n === 2) throw new DOMException('timed out', 'TimeoutError')
      return json({ ...ISSUE, labels: [] }, 201)
    })
    vi.stubGlobal('fetch', fetch)
    const result = await github.deliver({ fields: { note: 'x', tag: 'Bug' } }, '123456789', env)
    expect(result).toEqual({ id: '#42', skipped: ['tag'] })
  })

  it('ignores a lookup answer that is not the label asked for (dot segments)', async () => {
    for (const tag of ['..', '.']) {
      const { call } = stubFetch(json(REPO), json({ name: 'example-repo' }), json({ ...ISSUE, labels: [] }, 201))
      const result = await github.deliver({ fields: { note: 'x', tag } }, '123456789', env)
      expect(result.skipped).toEqual(['tag'])
      expect(bodyOf(call(2))).not.toHaveProperty('labels')
      vi.unstubAllGlobals()
    }
  })

  it('reports tag as skipped when GitHub silently drops an existing label', async () => {
    stubFetch(json(REPO), json(LABEL), json({ ...ISSUE, labels: [] }, 201))
    const result = await github.deliver({ fields: { note: 'x', tag: 'Bug' } }, '123456789', env)
    expect(result.skipped).toEqual(['tag'])
  })

  it('does not retry a 422', async () => {
    const { fetch } = stubFetch(json(REPO), json(LABEL), json({ message: 'spam' }, 422))
    await expect(github.deliver({ fields: { note: 'x', tag: 'Bug' } }, '123456789', env)).rejects.toBeInstanceOf(DeliveryError)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('leaves the screenshot out, says so in the body, and reports image as skipped', async () => {
    const { call } = stubFetch(json(REPO), json(LABEL), json(ISSUE, 201))
    const image = { base64: 'aGVsbG8=', mimeType: 'image/png', fileName: 'screenshot.png' }
    const result = await github.deliver({ fields: { note: 'x', tag: 'Bug' }, image }, '123456789', env)
    expect(result.skipped).toEqual(['image'])
    const sent = call(2)[1].body as string
    expect(sent).not.toContain('aGVsbG8=')
    expect(bodyOf(call(2)).body).toMatch(/screenshot was not attached/i)
  })

  it('neutralizes mentions and references in the title and body', async () => {
    const { call } = stubFetch(json(REPO), json({ ...ISSUE, labels: [] }, 201))
    await github.deliver({ fields: { note: '@octocat see #1\n<b>x</b>', reporter: '@admin' } }, '123456789', env)
    const sent = bodyOf(call(1))
    expect(sent.title).not.toMatch(/@octocat|#1/)
    expect(sent.body).not.toMatch(/@octocat|@admin|#1|<b>/)
  })

  it('throws ConfigError before any network call when GITHUB_TOKEN is missing', async () => {
    const { fetch } = stubFetch()
    await expect(github.deliver({ fields: { note: 'x' } }, '123456789', { GITHUB_TOKEN: ' ' })).rejects.toBeInstanceOf(ConfigError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails with only the status when the repository cannot be resolved', async () => {
    stubFetch(json({ message: 'secret-detail' }, 404))
    const err = await github.deliver({ fields: { note: 'x' } }, '123456789', env).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DeliveryError)
    expect((err as Error).message).toContain('404')
    expect((err as Error).message).not.toContain('secret-detail')
  })

  it('fails with only the status when GitHub refuses the issue, never echoing the body', async () => {
    stubFetch(json(REPO), json({ message: 'echo of the note: private text' }, 410))
    const err = await github.deliver({ fields: { note: 'private text' } }, '123456789', env).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DeliveryError)
    expect((err as Error).message).toContain('410')
    expect((err as Error).message).not.toContain('private text')
  })

  it('refuses a resolved repository name that is not owner/repo', async () => {
    stubFetch(json({ ...REPO, full_name: '../../evil' }))
    await expect(github.deliver({ fields: { note: 'x' } }, '123456789', env)).rejects.toBeInstanceOf(DeliveryError)
  })

  it('turns a network failure or timeout into a DeliveryError naming only the error type', async () => {
    for (const err of [new TypeError('fetch failed at secret-host'), new DOMException('signal timed out', 'TimeoutError')]) {
      vi.stubGlobal('fetch', async () => {
        throw err
      })
      const caught = await github.deliver({ fields: { note: 'x' } }, '123456789', env).catch((e: unknown) => e)
      expect(caught).toBeInstanceOf(DeliveryError)
      expect((caught as Error).message).toBe(`GitHub request failed: ${err.name}`)
    }
  })
})

describe('github provisioner', () => {
  afterEach(() => vi.unstubAllGlobals())
  const provisioner = github.provisioner!

  it('resolves owner/repo to its numeric id without creating anything', async () => {
    const { fetch, call } = stubFetch(json({ ...REPO, has_issues: true }))
    const result = await provisioner.create(' example-org/example-repo ', env)
    expect(result).toEqual({ ref: '123456789', url: REPO.html_url, reused: true, notes: [] })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = call(0)
    expect(url).toBe('https://api.github.com/repos/example-org/example-repo')
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-token', 'X-GitHub-Api-Version': '2026-03-10' })
    expectSafeInit(init)
    expect(github.isValidRef(result.ref)).toBe(true)
  })

  it('rejects anything that is not owner/repo, before any network call', async () => {
    const { fetch } = stubFetch()
    for (const name of ['', 'example-repo', 'a/b/c', '-org/repo', 'org/..', 'org/.', 'org/re po', 'https://github.com/a/b', 'org/repo?x=1', `${'a'.repeat(40)}/repo`]) {
      await expect(provisioner.create(name, env), name).rejects.toThrow(/owner\/repo/)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('needs GITHUB_TOKEN', async () => {
    await expect(provisioner.create('example-org/example-repo', {})).rejects.toBeInstanceOf(ConfigError)
  })

  it('explains a repository the token cannot see', async () => {
    stubFetch(json({ message: 'Not Found' }, 404))
    await expect(provisioner.create('example-org/example-repo', env)).rejects.toThrow(/404/)
  })

  it('refuses a repository with issues turned off', async () => {
    stubFetch(json({ ...REPO, has_issues: false }))
    await expect(provisioner.create('example-org/example-repo', env)).rejects.toThrow(/issues/i)
  })

  it('explains a response that is not JSON', async () => {
    stubFetch(new Response('<html>oops</html>', { status: 200 }))
    await expect(provisioner.create('example-org/example-repo', env)).rejects.toThrow(/unexpected/i)
  })

  it('has nothing to list', async () => {
    expect(await provisioner.list(env)).toEqual([])
  })
})
