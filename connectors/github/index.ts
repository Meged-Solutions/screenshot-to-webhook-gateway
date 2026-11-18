/**
 * Creates one GitHub issue per report in the repository the token names. The
 * ref is the repository's numeric id: it survives renames and transfers, and
 * "owner/repo" cannot fit in a ref. The screenshot is left out, because the
 * GitHub REST API cannot upload issue attachments.
 */
import type { ContractSample } from '../contract.js'
import { DeliveryError, requireEnv, type Connector } from '../types.js'
import { API, headers, parseFullName, repoPath, REPO_ID } from './api.js'
import { issueBody, issueTitle, oneLine } from './markdown.js'
import { provisioner } from './provision.js'

type Issue = { number?: unknown; labels?: unknown }

/** GitHub's current "owner/repo" for a repository id (it follows renames and transfers). */
async function resolveRepo(token: string, id: string): Promise<string> {
  const res = await fetch(`${API}/repositories/${id}`, { headers: headers(token) })
  if (!res.ok) throw new DeliveryError(`GitHub could not resolve the repository (${res.status})`)
  const { full_name } = (await res.json().catch(() => ({}))) as { full_name?: unknown }
  const target = typeof full_name === 'string' ? parseFullName(full_name) : undefined
  if (!target) throw new DeliveryError('GitHub returned an unexpected repository name')
  return repoPath(target)
}

async function createIssue(token: string, path: string, issue: { title: string; body: string; labels?: string[] }) {
  return fetch(`${API}/repos/${path}/issues`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(issue),
  })
}

const labelNames = (labels: unknown): string[] =>
  Array.isArray(labels) ? labels.map((l) => (typeof l === 'string' ? l : (l as { name?: unknown })?.name)).filter((n): n is string => typeof n === 'string') : []

export const github: Connector = {
  id: 'github',
  title: 'GitHub Issues',
  env: [
    {
      name: 'GITHUB_TOKEN',
      sensitive: true,
      scope: 'gateway',
      description: 'Fine-grained personal access token limited to the destination repositories, with the "Issues" repository permission set to "Read and write"',
    },
  ],

  isValidRef: (ref) => REPO_ID.test(ref),

  async deliver(report, ref, env) {
    const token = requireEnv(env, 'GITHUB_TOKEN')
    const skipped: string[] = []
    const tag = oneLine(report.fields.tag)
    const issue = { title: issueTitle(report.fields), body: issueBody(report.fields, { imageLeftOut: Boolean(report.image) }) }

    let res: Response
    try {
      const path = await resolveRepo(token, ref)
      res = await createIssue(token, path, tag ? { ...issue, labels: [tag] } : issue)
      // 422 is a validation failure; a label GitHub refuses (too long, say) is the one part we can drop.
      if (res.status === 422 && tag) res = await createIssue(token, path, issue)
    } catch (err) {
      if (err instanceof DeliveryError) throw err
      throw new DeliveryError('GitHub request failed')
    }
    // Never echo the response body: a validation error can quote the request back.
    if (!res.ok) throw new DeliveryError(`GitHub refused the issue (${res.status})`)

    const created = (await res.json().catch(() => ({}))) as Issue
    // GitHub silently drops labels the token may not set, so check what was applied.
    if (tag && !labelNames(created.labels).some((name) => name.toLowerCase() === tag.toLowerCase())) skipped.push('tag')
    if (report.image) skipped.push('image')
    return { id: typeof created.number === 'number' ? `#${created.number}` : '', skipped }
  },

  provisioner,
}

/** Used by the shared contract tests. */
export const contractSample: ContractSample = {
  validRef: '123456789',
  invalidRefs: ['example-org/example-repo', 'example-repo', '0', '0123', '12a', '-1', '1'.repeat(21)],
}
