/**
 * Resolves an existing "owner/repo" to the numeric repository id the token
 * stores. It never creates repositories, so there is nothing to list or upgrade.
 */
import { requireEnv, type Provisioner } from '../types.js'
import { gh, parseFullName, repoPath, REPO_ID } from './api.js'

type Repo = { id?: unknown; html_url?: unknown; has_issues?: unknown }

export const provisioner: Provisioner = {
  async create(name, env) {
    const token = requireEnv(env, 'GITHUB_TOKEN')
    const target = parseFullName(name.trim())
    if (!target) throw new Error(`"${name}" is not a GitHub repository: use owner/repo, such as example-org/example-repo`)

    const res = await gh(token, `/repos/${repoPath(target)}`)
    if (!res.ok) {
      const hint = res.status === 404 ? ': check the name, and that GITHUB_TOKEN is allowed to access this repository' : ''
      throw new Error(`GitHub could not find the repository (${res.status})${hint}`)
    }
    const repo = (await res.json().catch(() => {
      throw new Error('GitHub returned an unexpected response (not JSON)')
    })) as Repo
    const ref = String(repo.id)
    if (!REPO_ID.test(ref) || typeof repo.html_url !== 'string') throw new Error('GitHub returned an unexpected repository')
    if (repo.has_issues === false) throw new Error(`Issues are turned off for ${repo.html_url}; turn them on in its settings first`)
    return { ref, url: repo.html_url, reused: true, notes: [] }
  },

  // Destinations are existing repositories this tool did not create, so there is nothing to list.
  list: async () => [],
}
