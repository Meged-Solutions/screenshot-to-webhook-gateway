/** Shared GitHub REST API access: the fixed host and the recommended headers. */

export const API = 'https://api.github.com'
/** https://docs.github.com/en/rest/about-the-rest-api/api-versions */
export const API_VERSION = '2026-03-10'

export const headers = (token: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': API_VERSION,
  'User-Agent': 'screenshot-to-webhook-gateway',
})

/** Every GitHub call gives up after this long. */
const TIMEOUT_MS = 15_000

/** A GitHub API call with the recommended headers, a timeout, and no redirects followed. */
export const gh = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  })

/** A repository's numeric id, as stored in the token's ref. */
export const REPO_ID = /^[1-9][0-9]{0,19}$/
/** GitHub's owner (user or organization) and repository name rules. */
export const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
export const REPO_NAME = /^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/

/** "owner/repo" split into its parts, or undefined when either part breaks GitHub's rules. */
export function parseFullName(fullName: string): { owner: string; repo: string } | undefined {
  const parts = fullName.split('/')
  if (parts.length !== 2) return undefined
  const [owner, repo] = parts as [string, string]
  return OWNER.test(owner) && REPO_NAME.test(repo) ? { owner, repo } : undefined
}

export const repoPath = ({ owner, repo }: { owner: string; repo: string }) =>
  `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
