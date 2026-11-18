/**
 * Creates one GitHub issue per report in the repository the token names. The
 * ref is the repository's numeric id: it survives renames and transfers, and
 * "owner/repo" cannot fit in a ref. The screenshot is left out, because the
 * GitHub REST API cannot upload issue attachments.
 */
import type { ContractSample } from '../contract.js'
import { DeliveryError, requireEnv, type Connector } from '../types.js'
import { gh, parseFullName, repoPath, REPO_ID } from './api.js'
import { issueBody, issueTitle, oneLine } from './markdown.js'
import { provisioner } from './provision.js'

/** GitHub's limit for a label name. */
const MAX_LABEL = 50

type Issue = { number?: unknown; labels?: unknown }

/** GitHub's current "owner/repo" for a repository id (it follows renames and transfers). */
async function resolveRepo(token: string, id: string): Promise<string> {
  const res = await gh(token, `/repositories/${encodeURIComponent(id)}`)
  if (!res.ok) throw new DeliveryError(`GitHub could not resolve the repository (${res.status})`)
  const { full_name } = (await res.json().catch(() => ({}))) as { full_name?: unknown }
  const target = typeof full_name === 'string' ? parseFullName(full_name) : undefined
  if (!target) throw new DeliveryError('GitHub returned an unexpected repository name')
  return repoPath(target)
}

/**
 * The existing label named like the tag, as GitHub spells it. The reporter
 * controls the tag, so it never creates a label (labels can trigger
 * automation). Any failure means "no label", never a failed report.
 */
async function existingLabel(token: string, path: string, tag: string): Promise<string | undefined> {
  try {
    const res = await gh(token, `/repos/${path}/labels/${encodeURIComponent(tag)}`)
    if (!res.ok) return undefined
    const { name } = (await res.json()) as { name?: unknown }
    // Lookups are case-insensitive; anything else (a "." or ".." tag resolves to another path) is not this label.
    return typeof name === 'string' && name.toLowerCase() === tag.toLowerCase() ? name : undefined
  } catch {
    return undefined
  }
}

const labelNames = (labels: unknown): string[] =>
  Array.isArray(labels)
    ? labels.map((l) => (typeof l === 'string' ? l : (l as { name?: unknown })?.name)).filter((n): n is string => typeof n === 'string')
    : []

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
    if (!REPO_ID.test(ref)) throw new DeliveryError('Invalid GitHub repository id')
    const skipped: string[] = []
    const tag = Array.from(oneLine(report.fields.tag)).slice(0, MAX_LABEL).join('').trim()
    const issue = { title: issueTitle(report.fields), body: issueBody(report.fields, { imageLeftOut: Boolean(report.image) }) }

    let res: Response
    let label: string | undefined
    try {
      const path = await resolveRepo(token, ref)
      label = tag ? await existingLabel(token, path, tag) : undefined
      res = await gh(token, `/repos/${path}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(label ? { ...issue, labels: [label] } : issue),
      })
    } catch (err) {
      if (err instanceof DeliveryError) throw err
      throw new DeliveryError(`GitHub request failed: ${(err as Error)?.name ?? 'Error'}`)
    }
    // Never echo the response body: a validation error can quote the request back.
    if (!res.ok) throw new DeliveryError(`GitHub refused the issue (${res.status})`)

    const created = (await res.json().catch(() => ({}))) as Issue
    // GitHub silently drops labels the token may not set, so check what was applied.
    if (tag && !(label && labelNames(created.labels).some((name) => name.toLowerCase() === label.toLowerCase()))) skipped.push('tag')
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
