# Zapier connector

Each destination is one Zapier "Catch Hook" (the Webhooks by Zapier trigger). The gateway forwards every report to it as one JSON document, the same shape every forwarding connector sends (see `lib/forward.ts`):

```json
{
  "deliveryId": "dlv_<uuid>",
  "source": "screenshot-to-webhook-gateway",
  "report": { "note": "...", "pageUrl": "https://example.com" },
  "image": { "mimeType": "image/png", "fileName": "screenshot.png", "base64": "..." }
}
```

`image` is `null` when the report has no screenshot. The delivery id is also sent in the `X-Delivery-Id` header, and is the id the extension shows. It is a correlation id, new on every gateway call, so a resent report gets a new one; to drop duplicates, compare `capturedAt`, `reporter` and `pageUrl`. Report fields are listed in [docs/payload.md](../../docs/payload.md).

## Credentials

None. The connector needs no env vars: the hook URL is the only secret, and it travels inside the token.

## Setup

1. In Zapier, create a Zap with the trigger **Webhooks by Zapier > Catch Hook** and copy the webhook URL. It looks like `https://hooks.zapier.com/hooks/catch/1234567/abcdefg/`.
2. Take the two ids from the URL: the number after `/catch/` (your Zapier account id) and the code after it (the hook id). Join them with an underscore: `1234567_abcdefg`.
3. Issue a token after the gateway is deployed and `WEBHOOK_URL` is set in `.env.local` (see the root README), in your own terminal (the token is printed once, so keep it out of AI chats):

   ```sh
   npm run provision -- --connector zapier --ref 1234567_abcdefg
   ```

4. Paste the gateway URL and the token into the extension, send a test report, then finish the Zap in Zapier using the fields it caught.

There is no `--name`, `--list` or `--upgrade`: you create the Zap yourself, and the gateway has no Zapier credentials.

The ref accepts only `<digits>_<5 to 16 letters or digits>`. A pasted URL, a dash instead of the underscore, or a missing part is rejected. The gateway always rebuilds the URL on `https://hooks.zapier.com/hooks/catch/`, so a token can never send a report to any other host.

## The hook id is visible in the token

A token is signed, not encrypted. Its first parts (`zapier.<accountId>_<hookId>.<nonce>`) are readable by anyone who sees the token, and the same text is the token id you add to `REVOKED_TOKEN_IDS` to revoke it. So:

- Anyone holding the token can read your Catch Hook URL and post to it directly, bypassing the gateway. They could already post reports through the gateway with the token, so this adds little, but treat the token as a secret, just like the hook URL.
- `REVOKED_TOKEN_IDS` contains hook ids. Keep it in `.env.local` and Vercel env vars, never in committed files.
- Revoking a token stops the gateway from forwarding it, but does not stop direct posts to the hook. If a token leaks, also turn off or delete the Zap (Zapier then answers 404, after a delay of up to a few hours) and create a new Catch Hook with a new URL.

## Notes

- Zapier answers 200 to any request on a live hook, whatever the Zap does with it. A delivery the gateway reports as successful means Zapier accepted it, not that the later Zap steps succeeded. Check the Zap history for those.
- A turned-off or deleted Zap makes the gateway report a delivery error (Zapier answers 404).
- Use **Catch Hook**, not Catch Raw Hook: Catch Hook parses the JSON so each field can be mapped in later steps.

Zapier docs: [Get started with Webhooks by Zapier](https://help.zapier.com/hc/en-us/articles/8496083355661), [Trigger Zaps from webhooks](https://help.zapier.com/hc/en-us/articles/8496288690317).
