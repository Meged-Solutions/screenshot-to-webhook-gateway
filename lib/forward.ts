import { DeliveryError, type Delivered, type Report } from '../connectors/types.js'

/**
 * Forwards a report as one JSON document to a webhook (Zapier, Make, n8n or
 * any other "catch hook"). Every forwarding connector sends this same shape,
 * so a workflow built for one works for all:
 *
 *   {
 *     "deliveryId": "dlv_<uuid>",         // also in the X-Delivery-Id header
 *     "source": "screenshot-to-webhook-gateway",
 *     "report": { "note": "...", ... },   // the report fields, see docs/payload.md
 *     "image": { "mimeType", "fileName", "base64" } | null
 *   }
 *
 * The returned id is the delivery id, which the extension shows as the
 * report's id. It is a correlation id, new on every gateway call: a resent
 * report gets a new one, so it cannot detect duplicates.
 */
const TIMEOUT_MS = 25_000

export type ForwardOptions = { headers?: Record<string, string> }

export async function forwardReport(url: string, report: Report, options: ForwardOptions = {}): Promise<Delivered> {
  const deliveryId = `dlv_${crypto.randomUUID()}`
  let headers: Headers
  try {
    headers = new Headers(options.headers)
  } catch {
    // Node's message for an invalid header value contains the value, which can be a secret.
    throw new DeliveryError('Webhook request failed: invalid header')
  }
  headers.set('Content-Type', 'application/json')
  headers.set('X-Delivery-Id', deliveryId)
  const body = JSON.stringify({
    deliveryId,
    source: 'screenshot-to-webhook-gateway',
    report: report.fields,
    image: report.image ? { mimeType: report.image.mimeType, fileName: report.image.fileName, base64: report.image.base64 } : null,
  })
  let res: Response
  try {
    // redirect: 'error' keeps the report on the host the connector chose.
    res = await fetch(url, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    throw new DeliveryError(`Webhook unreachable: ${(err as Error).name}`)
  }
  // The body is never read; release the connection either way.
  await res.body?.cancel().catch(() => {})
  if (!res.ok) throw new DeliveryError(`Webhook refused the report (${res.status})`)
  return { id: deliveryId, skipped: [] }
}
