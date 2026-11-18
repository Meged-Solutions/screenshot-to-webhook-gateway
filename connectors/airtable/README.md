# Airtable connector

Each destination is one Airtable base with a Tickets table. Each report becomes one record with Status "New", and the screenshot is uploaded into its Screenshot field.

## Credentials

| Env var | Where | Scopes |
| --- | --- | --- |
| `AIRTABLE_PAT` | Vercel and `.env.local` | `data.records:read`, `data.records:write` |
| `AIRTABLE_PROVISION_PAT` | `.env.local` only | `schema.bases:read`, `schema.bases:write` |
| `AIRTABLE_WORKSPACE_ID` | `.env.local` only | The `wsp...` workspace where new bases are created |

Create both tokens at https://airtable.com/create/tokens and limit each to the workspace that holds your feedback bases.

## Provisioning

- `--name "Acme"` creates the base "Acme - Feedback", or reuses it if this tool created it (recognized by `[screenshot-to-webhook-gateway]` in the Tickets table description), and adds any missing fields. A same-named base without the marker stops the run.
- `--list` shows the bases this tool created.
- `--upgrade` adds new Tickets fields to every one of them. Existing fields and records are never changed. Airtable's API can't change the choices of an existing select field, so new Status choices only reach new bases.
- `--ref app...` issues a token for any base the gateway's `AIRTABLE_PAT` can write to. The base needs a Tickets table with the field names in `schema.ts`.

## Earlier tokens

The connector also accepts the 32-character tokens (`app...` followed by 15 characters) issued by earlier versions. Revoke one by adding its first 21 characters to `REVOKED_TOKEN_IDS`. New tokens always use the `airtable.<base>.<nonce>.<mac>` format.
