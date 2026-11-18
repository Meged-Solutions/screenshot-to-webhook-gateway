# Make connector

Each destination is one [Make](https://www.make.com) scenario that starts with a **Webhooks > Custom webhook** module. The gateway posts every report to that webhook as one JSON document, and the scenario does the rest (create a ticket, post to chat, save to a sheet).

No env vars and no provisioner: you build the scenario in Make, then issue a token for its webhook.

## Set up a destination

1. In Make, create a scenario and add **Webhooks > Custom webhook** as its trigger. Add a webhook and copy its address. It looks like `https://hook.eu1.make.com/abcdefghij0123456789klmnopqrstuv`.
2. Build the ref from the address: the zone (the part after `hook.`) and the token (the 32 characters after the last `/`), joined by `_`. For the address above the ref is `eu1_abcdefghij0123456789klmnopqrstuv`.
3. Issue a bearer token for the extension, in your own terminal:

   ```sh
   npm run provision -- --connector make --ref eu1_abcdefghij0123456789klmnopqrstuv
   ```

Supported zones: `eu1`, `eu2`, `us1`, `us2`. Other values, a pasted URL or a token that is not 32 lowercase letters and digits are rejected. The gateway always rebuilds the URL as `https://hook.<zone>.make.com/<token>` and does not follow redirects, so a ref can never send a report to another host. An older address without a zone (`https://hook.make.com/...`) is not supported: add a new webhook in Make, which gets a zoned address.

## Teach Make the data structure

Make learns the payload's fields from a sample request:

1. On the Custom webhook module, click **Redetermine data structure**. Make waits for one request.
2. Send a test report: take a screenshot with the extension using the new token, or post the same request with cURL (see [docs/payload.md](../../docs/payload.md)).
3. Make shows "Successfully determined". The fields below are now available to map in later modules.

Run it again whenever you want new report fields to show up for mapping.

## Payload

Every forwarding connector sends the same shape, defined in [lib/forward.ts](../../lib/forward.ts):

```json
{
  "deliveryId": "dlv_<uuid>",
  "source": "screenshot-to-webhook-gateway",
  "report": { "note": "Button overlaps footer", "pageUrl": "https://example.com" },
  "image": { "mimeType": "image/png", "fileName": "screenshot.png", "base64": "..." }
}
```

- `report` holds the report fields described in [docs/payload.md](../../docs/payload.md).
- `image` is `null` when the report has no screenshot. To attach it in Make, map `image.base64` through the `toBinary(...; base64)` function into a file field.
- `deliveryId` is also sent in the `X-Delivery-Id` header and is the id the gateway returns to the extension. Store it if you want to spot retries.

## Responses

Without a **Webhooks > Webhook response** module, Make answers `200 Accepted` as soon as it queues the request, and the gateway reports success. If the scenario has a Webhook response module, any status outside 2xx makes the gateway report a failed delivery. A deleted or disabled webhook, or a scenario that is off and has no queue room left, also counts as a failure.

## Security note

The bearer token is signed, not encrypted. The Make webhook token is readable inside it, and also in `REVOKED_TOKEN_IDS` when you revoke the bearer token. Anyone who holds the bearer token can already post reports through the gateway, so this adds little, but anyone who sees it can also post to the Make webhook directly. If a bearer token leaks, revoke it and also replace the webhook address in Make (create a new webhook and issue a new token).
