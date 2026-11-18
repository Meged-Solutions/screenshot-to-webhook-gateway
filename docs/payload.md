# Payload format

`POST /api/webhook` takes what the [Screenshot to Webhook - Annotate & Send](https://chromewebstore.google.com/detail/screenshot-to-webhook-ann/jpdgfdnielfhckdenioikfnkjmonmjon) extension sends. Any other tool, script or cURL call can send the same shape.

## Request

- `Authorization: Bearer <token>`: a token from `npm run provision`.
- `Content-Type: application/json` or `multipart/form-data`. Anything else gets 400.
- Body limit: Vercel caps request bodies at 4.5 MB. The JSON format sends the image twice (`image` and `imageBase64`), so screenshots larger than about 1.6 MB are rejected. Multipart costs less.

## Fields

Every key is optional. Keys the gateway does not know are ignored.

| Key | Type | Meaning |
| --- | --- | --- |
| `note` | string | The reporter's feedback. Its first line becomes the ticket summary. |
| `pins` | array | Annotation pins as the extension records them, stored as JSON text. |
| `pinsText` | string | The pins as readable text, such as `1. misaligned`. |
| `pinCount` | number | Number of pins. |
| `pageUrl` | string | The page the screenshot was taken on. |
| `pageTitle` | string | Its title. Used as the summary when `note` is empty. |
| `capturedAt` | string | ISO 8601 time of the capture. |
| `browser`, `os`, `screen`, `viewport` | string | Environment details. |
| `tag` | string | The tag picked in the extension's editor. `null`, an empty value or a missing key all mean "no tag". It is cut to one line of 100 characters. |
| `reporter` | string | Who reported it. See the header below. |

## Image

Send one screenshot in any of these ways. The first one present wins.

- JSON `imageBase64` (raw base64), with optional `imageMimeType` (default `image/png`) and `imageFileName`.
- JSON `image` as a data URL: `data:image/png;base64,...`.
- Multipart: a file part named `image`.

Image keys are never stored as text fields.

## Reporter header

The extension lets users add custom headers. A header named `reporter` fills `reporter` when the body does not set it. The name is matched on letters only and forgives one typo, so `Reporter`, `reported-by`, `Reported_By` and `repoter` all work. The value is cut to one line of 100 characters.

## Responses

| Status | Body |
| --- | --- |
| 200 | `{ "ok": true, "id": "<id>" }`, plus `"skipped": [<field names>]` when the destination left some out. The id is the Airtable record id (`rec...`), the GitHub issue number (`#12`), or the delivery id (`dlv_...`) for n8n, Make and Zapier |
| 400 | Malformed body or unsupported Content-Type |
| 401 | Missing, invalid or revoked token |
| 500 | The gateway or the token's connector is missing env vars |
| 502 | The destination refused the report. `id` is included when part of it was saved |

Airtable never fails a report over its content: each value is fitted to its column, and a field the base refuses is skipped and listed in `skipped`. GitHub lists `tag` (no matching label) and `image` (no attachment API) in `skipped`. n8n, Make and Zapier forward everything as is.

## Example

```sh
curl -X POST 'https://your-project.vercel.app/api/webhook' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -H 'reporter: Dana' \
  -d '{"note":"Button overlaps the footer\nOnly on mobile","pageUrl":"https://example.com/settings","pageTitle":"Settings","tag":"Bug"}'
```

## Forwarded payload

The n8n, Make and Zapier connectors forward each report to your workflow as this JSON document, with the delivery id also in the `X-Delivery-Id` header:

```json
{
  "deliveryId": "dlv_00000000-0000-0000-0000-000000000000",
  "source": "screenshot-to-webhook-gateway",
  "report": { "note": "Button overlaps the footer", "pageUrl": "https://example.com/settings", "tag": "Bug" },
  "image": { "mimeType": "image/png", "fileName": "screenshot.png", "base64": "iVBORw0KGgo..." }
}
```

`report` holds the fields from the table above, and `image` is `null` when the report has no screenshot. The gateway answers the extension with the `deliveryId` as `id`. It is a correlation id, new on every gateway call, so a resent report gets a new one; to drop duplicates, compare `capturedAt`, `reporter` and `pageUrl`.
