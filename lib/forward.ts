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
 * The returned id is the delivery id: webhooks rarely return a record id, and
 * the workflow can store this one to match retries.
 */
const TIMEOUT_MS = 25_000

export type ForwardOptions = { headers?: Record<string, string> }

export async function forwardReport(url: string, report: Report, options: ForwardOptions = {}): Promise<Delivered> {
  const deliveryId = `dlv_${crypto.randomUUID()}`
  const headers = new Headers(options.headers)
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
  if (!res.ok) throw new DeliveryError(`Webhook refused the report (${res.status})`)
  await res.body?.cancel()
  return { id: deliveryId, skipped: [] }
}
