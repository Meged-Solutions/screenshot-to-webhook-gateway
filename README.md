# screenshot-to-webhook-gateway

Your own backend for the free [Screenshot to Webhook - Annotate & Send](https://chromewebstore.google.com/detail/screenshot-to-webhook-ann/jpdgfdnielfhckdenioikfnkjmonmjon) Chrome extension. Reporters annotate a screenshot and send it, and the gateway turns each report into a ticket in a tool you choose.

```
extension  ──POST + Bearer token──▶  gateway (Vercel)  ──▶  connector  ──▶  Airtable, or yours
```

- **One deployment, many destinations.** Each destination (an Airtable base per client, for example) gets its own signed token. A token can't be edited to reach another destination, and you can revoke any token on its own.
- **Connectors.** Airtable is built in. Add more by implementing one small interface: [contributions welcome](#contribute-a-connector).
- **No database and no UI.** Just a Vercel function and your own accounts.
- **Built to set up with an AI agent.** Open it in Claude Code or Codex and say "set this up".

## Quick start with Claude Code or Codex

```sh
git clone https://github.com/Meged-Solutions/screenshot-to-webhook-gateway.git
cd screenshot-to-webhook-gateway
```

Open the folder in Claude Code or Codex and ask it to **set this up**. The agent follows [the setup skill](.agents/skills/setup/SKILL.md): it checks your environment, tells you which tokens to create and where to put them, deploys, and creates your first destination. It never asks you to paste secrets into the chat. You type them into `.env.local` yourself.

## Deploy with Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMeged-Solutions%2Fscreenshot-to-webhook-gateway&env=WEBHOOK_SIGNING_SECRET,AIRTABLE_PAT&envDescription=A%20random%20secret%20of%2032%2B%20characters%20and%20an%20Airtable%20token%20with%20data.records%3Aread%20and%20data.records%3Awrite&envLink=https%3A%2F%2Fgithub.com%2FMeged-Solutions%2Fscreenshot-to-webhook-gateway%23manual-setup)

The button copies the repo into your GitHub account and deploys it. Generate the secret with `openssl rand -hex 32`. Then clone your copy, run `cp .env.example .env.local`, and paste the same secret into `.env.local` before you run `npm run setup`. Tokens are signed locally and verified on Vercel, so both must hold the same secret, or every token is refused with 401.

## Manual setup

You need Node 24, a [Vercel](https://vercel.com) account (the free plan is enough) and an [Airtable](https://airtable.com) account.

1. **Install and check:**
   ```sh
   npm install
   npm run setup        # creates .env.local, generates WEBHOOK_SIGNING_SECRET, lists what is missing
   ```
2. **Airtable:** create a workspace for your feedback bases. Then, in the [Builder hub](https://airtable.com/create/tokens), create two tokens, both limited to that workspace:
   - `AIRTABLE_PAT` (deployed): scopes `data.records:read`, `data.records:write`
   - `AIRTABLE_PROVISION_PAT` (local only): scopes `schema.bases:read`, `schema.bases:write`

   Put both in `.env.local`, plus `AIRTABLE_WORKSPACE_ID` (the `wsp...` part of the workspace URL).
3. **Deploy:**
   ```sh
   vercel link
   npm run sync-vercel-env   # pushes only the gateway vars; secrets are stored as Sensitive
   vercel deploy --prod
   ```
   Set `WEBHOOK_URL` in `.env.local` to the project domain the deploy prints as `Aliased:`, plus `/api/webhook`: `https://<your-project>.vercel.app/api/webhook`. Per-deployment URLs sit behind Vercel's Deployment Protection and would refuse the extension.
4. **Create a destination and a token:**
   ```sh
   npm run provision -- --connector airtable --name "Acme"
   ```
   This creates an "Acme - Feedback" base with a ready Tickets table and prints the webhook URL and a bearer token. The token is not stored anywhere, so copy it now.
5. **Connect the extension:** in its settings, choose auth type Bearer and paste the URL and token. Send a screenshot, and a ticket appears in the base.

Running provision again with the same name reuses the base, adds any missing fields, and issues a new token. Other commands:

```sh
npm run provision -- --connector airtable --list      # bases this tool created
npm run provision -- --connector airtable --upgrade   # add new Tickets fields to every base
npm run provision -- --connector airtable --ref appXXXXXXXXXXXXXX   # token for an existing base
```

## Revoke or rotate a token

Each token prints a token id. Add it to `REVOKED_TOKEN_IDS` (comma-separated) in `.env.local`, run `npm run sync-vercel-env`, and redeploy. Run provision again to issue a replacement. Rotating `WEBHOOK_SIGNING_SECRET` revokes every token at once.

## The Airtable Tickets table

Fields filled from each report: Summary (the first line of the note, and the primary field), Description, Tag, Screenshot, Pins, Page URL, Page Title, Captured At, Browser, OS, Screen, Viewport, Pin Count and Reporter.

Fields for your team: Ticket ID (an auto number), Record ID, Ticket Description, Status, Priority, Assignee, Due Date, Ticket Enhancement, Completion Note, Additional Comments and Completed At.

New tickets start as New. Status moves through Triage, Needs info, Backlog, Ready for dev, In progress, In review, Ready for QA, In QA, Ready for release and Done, or closes as Duplicate or Won't fix. If your team renames or deletes a field, new tickets are still saved without it, and the response lists it under `skipped`.

## Endpoint

`POST /api/webhook` with `Authorization: Bearer <token>` and a JSON or multipart body. The fields, image formats, responses and a cURL example are in [docs/payload.md](docs/payload.md).

Limits: Vercel caps request bodies at 4.5 MB (screenshots up to about 1.6 MB with JSON, a bit more with multipart), and Airtable caps an attachment upload at 5 MB.

## Connectors

| Connector | Destination | Provisioning |
| --- | --- | --- |
| [`airtable`](connectors/airtable) | A Tickets table in one base per destination | Creates and upgrades bases |
| *yours?* | Notion, Google Sheets, Linear, Jira, Slack, Supabase... | [Contribute one](#contribute-a-connector) |

## Contribute a connector

Connectors are small: one folder, one interface, and shared contract tests that tell you when you're done. Copy [`connectors/_template`](connectors/_template), or ask Claude Code or Codex to **add a connector for <service>** and it will follow [the add-connector skill](.agents/skills/add-connector/SKILL.md). See [CONTRIBUTING.md](CONTRIBUTING.md), and open a [connector request](https://github.com/Meged-Solutions/screenshot-to-webhook-gateway/issues/new?template=connector-request.yml) to say what you're building.

## Develop

```sh
npm install
npm test               # unit tests, no network
npm run typecheck
npm run check:hygiene  # no real emails or deployment URLs in tracked files
npm run dev            # vercel dev, reads .env.local
```

## License

[MIT](LICENSE)

---

Maintained by [Meged Solutions](https://github.com/Meged-Solutions).
