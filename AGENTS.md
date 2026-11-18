# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex and others) working in this repo.

## What this is

A webhook gateway on Vercel for the "Screenshot to Webhook - Annotate & Send" Chrome extension. `api/webhook.ts` verifies the bearer token (`lib/token.ts`), parses the report (`lib/payload.ts`), and hands it to the connector the token names (`connectors/<id>/`). Tokens look like `<connector>.<ref>.<nonce>.<mac>`, signed with `WEBHOOK_SIGNING_SECRET`, so one deployment serves many destinations. There is no database and no UI.

```
api/webhook.ts          the only endpoint
lib/                    token, payload parsing, config
connectors/types.ts     the Connector interface
connectors/index.ts     registry of connectors
connectors/contract.ts  rules every connector must pass
connectors/<id>/        one connector (airtable is built in, _template is a copy-me)
scripts/                setup, provision, sync-vercel-env, check-hygiene
docs/payload.md         the request format
```

## Commands

```sh
npm run setup            # first run: creates .env.local, generates the signing secret, reports what is missing
npm test                 # vitest, no network
npm run typecheck
npm run check:hygiene    # banned strings: real emails and real vercel.app URLs
npm run dev              # vercel dev
npm run provision -- --connector <id> (--name "<name>" | --ref <id> | --list | --upgrade)
npm run sync-vercel-env  # push gateway env vars from .env.local to Vercel production
```

## Tasks

- **Set up a deployment:** follow [.agents/skills/setup/SKILL.md](.agents/skills/setup/SKILL.md).
- **Add a connector:** follow [.agents/skills/add-connector/SKILL.md](.agents/skills/add-connector/SKILL.md).

## Rules

- **Secrets:** never ask the user to paste a token, personal access token or signing secret into the chat, and never print one. The user types secrets into `.env.local` themselves. Read `.env.local` only through `npm run setup`, which reports set or missing without values. Commands that print a bearer token (`npm run provision` without `--list` or `--upgrade`) are run by the user in their own terminal, not by you, so the token never enters the AI session.
- **No personal data in files:** config comes from env vars or CLI flags, with no fallback values. Docs and tests use `example.com`, `your-project.vercel.app` and made-up ids. `npm run check:hygiene` must pass.
- **Naming:** the extension is "Screenshot to Webhook - Annotate & Send", or "the extension" for short.
- **Tests first:** add or change a test, watch it fail, then change the code. Tests stub `fetch` and never call real services.
- **Before you finish:** `npm run typecheck && npm test && npm run check:hygiene`.
- **Connectors stay independent:** connector code lives in its own folder and depends only on `connectors/types.ts` and `lib/`. Core code never imports a specific connector except through `connectors/index.ts`.
- **Provisioning credentials stay local:** a connector env var with `scope: 'provision'` must never be pushed to Vercel.
