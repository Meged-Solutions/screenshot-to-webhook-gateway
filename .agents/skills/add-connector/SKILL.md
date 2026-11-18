---
name: add-connector
description: Use when the user wants to add, build or contribute a new destination connector (Notion, Google Sheets, Linear, Jira, Slack, Supabase or any other service) so reports from the extension go somewhere other than Airtable.
---

# Add a connector

A connector sends each report to one service. Read `connectors/types.ts` (the interface), `connectors/_template/` (a minimal working connector) and `connectors/airtable/` (a full one with provisioning) before writing code.

## 1. Pin down the design with the user

Settle these before writing code:

- **What a report becomes:** a row, a page, an issue or a message, and which report fields map where (keys are in `docs/payload.md`).
- **The destination ref:** the id that goes inside the token (a database, sheet, project or channel id). It must match `[A-Za-z0-9_-]{1,128}`. Write the strictest regex the service allows.
- **Auth:** which env var holds the credential, its minimum scopes, and whether provisioning needs a separate, broader credential (`scope: 'provision'`, never deployed).
- **The image:** whether the service can take the screenshot, and how (direct upload, or a link the service fetches).
- **Provisioning:** whether `npm run provision -- --name` should create destinations, or whether users bring an existing id with `--ref`.

Check the service's current API docs. Don't rely on memory for endpoints or auth.

## 2. Build it test-first

1. Copy `connectors/_template` to `connectors/<id>/`. The id is lowercase, such as `notion` or `google-sheets`.
2. Register it in `connectors/index.ts`, and export `contractSample` from its `index.ts`.
3. Run `npx vitest run connectors`. The shared contract tests now run for it: make them pass first.
4. In `connectors/<id>/index.test.ts`, write a failing test for each behavior with `fetch` stubbed (`vi.stubGlobal('fetch', ...)`): what `deliver` sends, how refused fields end up in `skipped`, `DeliveryError` when the service refuses, and `DeliveryError` with the id when the record was saved but the image failed. Then implement.
5. Rules for `deliver`: call `requireEnv` before any network call; never log credentials or full report contents; a field the service refuses must not sink the whole report when the service lets you retry without it.
6. If it has a provisioner, keep it idempotent: re-running with the same name reuses what this connector created and never adopts something it didn't.

## 3. Document it

- Add every env var to `.env.example` with a comment, and to the connector's `env` list with a description (a test checks that they match).
- Write `connectors/<id>/README.md`: what it creates, the credential and scopes, and setup steps.
- Add a row to the connectors table in the root `README.md`.

## 4. Finish

```sh
npm run typecheck && npm test && npm run check:hygiene
```

Then help the user open a pull request using `.github/pull_request_template.md`.
