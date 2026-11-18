# n8n connector

Each destination is one Webhook node in a workflow on your own n8n instance (self-hosted or n8n Cloud). Each report is posted as one JSON document to the node's production URL, `<N8N_BASE_URL>/webhook/<path>`, and the workflow takes it from there.

## Credentials

| Env var | Where | Value |
| --- | --- | --- |
| `N8N_BASE_URL` | Vercel and `.env.local` | Your instance URL, such as `https://n8n.example.com` or `https://your-name.app.n8n.cloud`. Include a sub-path if n8n is served under one (`https://example.com/n8n`). |
| `N8N_WEBHOOK_SECRET` | Vercel and `.env.local`, optional | A long random string. When set, every request carries it in the `X-Webhook-Secret` header. |

`N8N_BASE_URL` must be https, with no `/webhook`, query string, fragment or credentials in it; a trailing slash is fine. Plain http is accepted only for `localhost`, `127.0.0.1` and `[::1]`, which is useful with `vercel dev` against a local n8n. An invalid value fails delivery with a config error before any request is made.

## Set up the workflow

1. In n8n, create a workflow that starts with a **Webhook** node.
2. Set **HTTP Method** to `POST`. Leave **Respond** on `Immediately`: the gateway waits at most 25 seconds for an answer.
3. Keep the generated **Path** (a UUID) or type your own. The connector accepts one path segment of letters, digits, `-` and `_`: no slashes and no `:param` route parameters.
4. Optional, recommended: set **Authentication** to `Header Auth` and create a Header Auth credential with **Name** `X-Webhook-Secret` and **Value** equal to `N8N_WEBHOOK_SECRET`. n8n then refuses requests without it.
5. Add the rest of your workflow, save it, and publish (activate) it.
6. Issue a token for the path in your own terminal:

   ```sh
   npm run provision -- --connector n8n --ref <path>
   ```

There is no `--name`, `--list` or `--upgrade` for n8n: you create workflows yourself.

## Test URL vs production URL

The Webhook node shows two URLs. The **Test URL** (`/webhook-test/<path>`) only listens for about two minutes after you click **Listen for test event**, and shows the data in the editor. The **Production URL** (`/webhook/<path>`) works only while the workflow is published, and its runs appear under **Executions**. The gateway always calls the production URL, so a report sent to an unpublished workflow is refused with an error status and the extension sees a delivery error.

If your instance changes the production endpoint with `N8N_ENDPOINT_WEBHOOK`, this connector does not support it: it always uses `/webhook`.

## Payload

The body is the shared forward shape from [`lib/forward.ts`](../../lib/forward.ts), the same one every forwarding connector sends:

```json
{
  "deliveryId": "dlv_...",
  "source": "screenshot-to-webhook-gateway",
  "report": { "note": "...", "pageUrl": "https://example.com" },
  "image": { "mimeType": "image/png", "fileName": "screenshot.png", "base64": "..." }
}
```

`image` is `null` when the report has no screenshot. The delivery id is also sent in the `X-Delivery-Id` header; store it to recognize retries. In n8n the fields are under `{{ $json.body.report }}`, and a **Convert to File** node (the base64-to-file operation, source `body.image.base64`) turns the screenshot into binary data for later nodes. See [docs/payload.md](../../docs/payload.md) for the report fields.
