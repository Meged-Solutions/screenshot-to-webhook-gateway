# GitHub Issues connector

Each destination is one GitHub repository. Each report becomes one issue: the note's first line is the title, the body quotes the note and lists the page and environment details, and the extension's tag is added as a label.

## Credentials

| Env var | Where | Permissions |
| --- | --- | --- |
| `GITHUB_TOKEN` | Vercel and `.env.local` | Fine-grained personal access token, "Issues": Read and write |

Create the token at https://github.com/settings/personal-access-tokens/new. Under "Repository access" choose "Only select repositories" and pick the destination repositories, then set the "Issues" repository permission to "Read and write". GitHub adds "Metadata": Read-only by itself, which the gateway needs to look up a repository. For a repository owned by an organization, choose the organization as the resource owner; it may have to approve the token. The same token is used by `npm run provision`.

## Provisioning

- `--name example-org/example-repo` looks up an existing repository and issues a token for it. It never creates repositories, and it stops if the token cannot see the repository or its issues are turned off.
- `--ref 123456789` issues a token for a repository id you already know (`gh api repos/example-org/example-repo --jq .id` prints it).
- `--list` prints nothing: the destinations are your own repositories, not something this tool created.

The token stores the repository's numeric id, not `owner/repo`, so renaming or transferring the repository keeps its tokens working. On each report the gateway looks up the repository's current name with `GET /repositories/{id}` and then creates the issue with the documented `POST /repos/{owner}/{repo}/issues`. The lookup by id is not in GitHub's REST reference, but it has been stable for years; if it ever stops working, tokens need a new ref format.

## What the issue contains

- **Title:** the note's first line, else the page title, else "Feedback from <page host>", cut to 256 characters.
- **Body:** the note as a quote, then the page URL, page title, capture time, browser, OS, screen, viewport, pin count, reporter and tag, then the pins text.
- **Label:** the tag. GitHub creates a label that does not exist yet when the token's user may manage labels, and silently drops it otherwise. When the label is dropped or refused, the issue is still created, `tag` is listed in `skipped`, and the tag stays in the body.
- **Response id:** `#<issue number>`. It does not reveal the repository name to whoever sent the report.

Report text comes from anyone who uses the extension, so the body is built defensively: Markdown and HTML are escaped, single-line fields cannot start new blocks, the page URL is shown as code (not a link), and `@mentions`, `#123` or `GH-123` references and autolinked URLs are broken with a zero-width space, so a report cannot ping people, cross-link issues or plant clickable links. Control characters and bidirectional overrides are removed.

## Screenshots

The GitHub REST API has no endpoint for issue attachments, so the screenshot is not sent. The issue says so, and `image` is listed in `skipped`. The connector never commits images to the repository. If you need screenshots, use the Airtable connector, or send reports to an automation tool such as n8n that stores the image and then opens the issue.
