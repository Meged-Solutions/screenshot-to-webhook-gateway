---
name: setup
description: Use when the user wants to set up, install, deploy or configure this gateway, connect the Screenshot to Webhook - Annotate & Send extension, or create their first Airtable base and token.
---

# Set up the gateway

Goal: a deployed gateway, a first destination, and the extension sending reports to it. Work through the steps in order and check each before moving on. Keep the user in charge of every secret.

**Never** ask for, accept or print a token, personal access token or signing secret. If the user pastes one into the chat, tell them to revoke it and create a new one. Secrets go into `.env.local`, which the user edits.

## 1. Install and check

```sh
npm install
npm run setup
```

`npm run setup` needs Node 24. It creates `.env.local` from `.env.example`, generates `WEBHOOK_SIGNING_SECRET`, and lists every var as set, missing or optional without showing values. Re-run it after each step below to confirm progress.

## 2. Airtable tokens

Ask the user to:

1. Create (or pick) an Airtable workspace for feedback bases.
2. Open https://airtable.com/create/tokens and create two tokens, both with access limited to that workspace:
   - `AIRTABLE_PAT`: scopes `data.records:read` and `data.records:write`. The deployed gateway uses it.
   - `AIRTABLE_PROVISION_PAT`: scopes `schema.bases:read` and `schema.bases:write`. Local only, it creates bases.
3. Paste both into `.env.local`, and set `AIRTABLE_WORKSPACE_ID` to the `wsp...` id from the workspace URL.

Run `npm run setup` and confirm all three show `set`.

## 3. Deploy to Vercel

Check that the Vercel CLI is installed (`vercel --version`); if not, `npm i -g vercel`. Then:

```sh
vercel link              # the user picks or creates the project
npm run sync-vercel-env  # pushes WEBHOOK_SIGNING_SECRET, REVOKED_TOKEN_IDS and AIRTABLE_PAT only
vercel deploy --prod
```

Take the project domain from the deploy output: the `Aliased:` line, `https://<project>.vercel.app`. Do not use the per-deployment `Production:` URL. New Vercel projects protect per-deployment URLs with Deployment Protection, so the extension would get Vercel's own 401 and never reach the gateway. Ask the user to set `WEBHOOK_URL=https://<project>.vercel.app/api/webhook` in `.env.local`.

Check the deployment with that URL written out in the command. A request without a token must get the gateway's own answer:

```sh
curl -s -X POST 'https://<project>.vercel.app/api/webhook' -H 'Content-Type: application/json' -d '{}'
```

- `{"ok":false,"error":"Unauthorized"}`: the gateway is live.
- `{"ok":false,"error":"Server is not configured"}`: an env var is missing on Vercel. Re-run `npm run sync-vercel-env` and redeploy.
- An HTML page or a Vercel authentication page: the URL is protected or wrong. Use the `Aliased:` domain, or turn off Deployment Protection for production in the project settings.

## 4. First destination

Ask for a name (a client, a product or "Internal"). The command prints the bearer token, so the **user runs it in their own terminal window**, not through you (and not with Claude Code's `!` prefix, which copies output into the chat). That keeps the token out of the AI session:

```sh
npm run provision -- --connector airtable --name "<name>"
```

It creates the "<name> - Feedback" base and prints the webhook URL and the token, once. The user copies both into the extension. Ask them to tell you only that it worked, or the error message, never the token.

## 5. Connect the extension

The user installs [Screenshot to Webhook - Annotate & Send](https://chromewebstore.google.com/detail/screenshot-to-webhook-ann/jpdgfdnielfhckdenioikfnkjmonmjon). In its settings they set the webhook URL, choose auth type **Bearer**, and paste the token. Optionally they add a custom header `reporter` with their name.

They send a test screenshot, and a ticket should appear in the base's Tickets table. If it doesn't, ask for the HTTP status the extension shows and check `vercel logs`. 401 means a wrong or revoked token, a different signing secret in `.env.local` than on Vercel, or a URL behind Deployment Protection; 502 means Airtable refused the report (check that `AIRTABLE_PAT` covers the workspace).

## Done

Summarize what was set up: the Vercel project URL, the base name and the token id (not the token). Point to README.md for revoking tokens and adding more destinations.
