# Contributing

Thanks for helping. New connectors are the most useful contribution: each one lets everyone send reports to one more tool.

## Before you start

- For a new connector, open a [connector request](https://github.com/Meged-Solutions/screenshot-to-webhook-gateway/issues/new?template=connector-request.yml) saying you're building it, so two people don't build the same one.
- For bugs, open a bug report. For security issues, use [private reporting](SECURITY.md) instead.

## Develop

```sh
npm install
npm test
npm run typecheck
npm run check:hygiene
```

You don't need any accounts to run the tests: they stub `fetch` and never call real services.

## Adding a connector

Start from [`connectors/_template`](connectors/_template), or ask Claude Code or Codex to follow [the add-connector skill](.agents/skills/add-connector/SKILL.md). A connector is ready when:

- It lives in `connectors/<id>/`, is registered in `connectors/index.ts` and exports `contractSample`.
- It passes the shared contract tests (`npx vitest run connectors`). They check the id, ref validation, env documentation, and that `deliver` checks env before any network call.
- It has its own tests for what it sends and how it handles refusals, with `fetch` stubbed.
- `isValidRef` is as strict as the service allows. The ref is inside every token.
- Refused fields go into `skipped` where the service allows a retry without them, so one odd value never loses a report.
- Its env vars are in `.env.example` and in its `env` list. Credentials only the CLI needs use `scope: 'provision'`, so they are never deployed.
- `connectors/<id>/README.md` explains the credential, the scopes and the setup, and the root README's connectors table has a row for it.

## Rules for every change

- Never commit secrets, real email addresses, real deployment URLs or personal data. Use `example.com`, `your-project.vercel.app` and made-up ids. CI runs `npm run check:hygiene` and a gitleaks scan.
- Write the test first and watch it fail.
- Keep connectors independent: a connector depends only on `connectors/types.ts` and `lib/`.
- Call the extension "Screenshot to Webhook - Annotate & Send", or "the extension".

## Pull requests

Fill in the PR template checklist. CI must pass. A maintainer reviews it for correctness, security (token and credential handling) and whether it is simple enough to maintain.
