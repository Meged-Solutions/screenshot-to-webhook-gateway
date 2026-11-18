# Security

Please report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/Meged-Solutions/screenshot-to-webhook-gateway/security/advisories/new), not in public issues.

Include what is affected, how to reproduce it, and the impact you see. Never include real tokens or credentials: replace them with `<redacted>`.

If a token or credential of yours has leaked:

- **A bearer token:** add its token id to `REVOKED_TOKEN_IDS`, run `npm run sync-vercel-env`, and redeploy.
- **The signing secret:** generate a new `WEBHOOK_SIGNING_SECRET` (this revokes every token), sync, redeploy, and issue new tokens.
- **An Airtable or other service token:** revoke it at the service, create a new one, and update `.env.local` and Vercel.
