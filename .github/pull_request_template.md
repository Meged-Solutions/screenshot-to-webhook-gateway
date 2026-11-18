## What this changes

<!-- One or two sentences. For a new connector, name the destination. -->

## Checklist

- [ ] `npm run typecheck`, `npm test` and `npm run check:hygiene` pass
- [ ] Tests stub `fetch`; nothing calls a real service
- [ ] No secrets, real emails, real URLs or personal data in code, tests or docs (use example.com and your-project.vercel.app)
- [ ] New env vars are in `.env.example` and the connector's `env` list, with descriptions

### New connector only

- [ ] Lives in `connectors/<id>/`, is registered in `connectors/index.ts` and exports `contractSample`
- [ ] Passes the shared contract tests
- [ ] `isValidRef` is strict, and `deliver` checks env before any network call
- [ ] Row added to the connectors table in `README.md`, with setup steps in `connectors/<id>/README.md`
