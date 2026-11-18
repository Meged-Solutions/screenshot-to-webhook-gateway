# Connector template

A working, minimal connector to copy. It forwards each report as JSON to `TEMPLATE_URL`. It is not registered, so the gateway never uses it.

## Make a real connector

1. Copy this folder to `connectors/<id>/`. The id is lowercase letters, digits and dashes, such as `notion` or `google-sheets`. It becomes the first part of every token.
2. In `index.ts`, rename the export and set `id`, `title` and `env`. Mark secrets `sensitive: true`. Use `scope: 'gateway'` for vars the deployed gateway reads and `scope: 'provision'` for vars only the local CLI needs.
3. Make `isValidRef` strict. The ref is the destination id stored in the token (a base, database, sheet or channel id) and must match `[A-Za-z0-9_-]{1,128}`.
4. Implement `deliver`. For a webhook-style destination, call `forwardReport` from `lib/forward.ts`, as this template does. For an API, give every `fetch` a timeout and `redirect: 'error'`, like `connectors/github`. Call `requireEnv` before any network call. Throw `DeliveryError` when the destination refuses the report (pass the record id if part of it was saved). Return the fields the destination refused in `skipped` instead of failing the whole report.
5. Optional: add a `provisioner` so `npm run provision -- --connector <id> --name "Acme"` can create destinations. Without one, users issue tokens with `--ref <destination id>`.
6. Register it in `connectors/index.ts` and export `contractSample` from `index.ts`.
7. Add its env vars to `.env.example` and a row to the connectors table in the root `README.md`.
8. Write tests next to it (`index.test.ts`) with `fetch` stubbed: no real network in tests. Run `npm test`.
