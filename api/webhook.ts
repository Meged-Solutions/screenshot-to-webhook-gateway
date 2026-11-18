import { CONNECTORS, getConnector } from '../connectors/index.js'
import { ConfigError, DeliveryError, type Connector } from '../connectors/types.js'
import { loadConfig, type Config } from '../lib/config.js'
import { parsePayload, PayloadError } from '../lib/payload.js'
import { bearerOf, verifyToken } from '../lib/token.js'

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status })

/** The connector and destination a bearer token names, or undefined for 401. */
export function resolve(header: string | null, config: Config): { connector: Connector; ref: string } | undefined {
  const token = bearerOf(header)
  if (!token) return undefined
  const claims = verifyToken(token, config.signingSecret, config.revokedIds)
  if (claims) {
    const connector = getConnector(claims.connector)
    return connector?.isValidRef(claims.ref) ? { connector, ref: claims.ref } : undefined
  }
  for (const connector of CONNECTORS) {
    const legacy = connector.verifyLegacy?.(token, config.signingSecret, config.revokedIds)
    if (legacy) return { connector, ref: legacy.ref }
  }
  return undefined
}

export async function POST(request: Request): Promise<Response> {
  let config
  try {
    config = loadConfig()
  } catch (err) {
    console.error('config error:', (err as Error).message)
    return json(500, { ok: false, error: 'Server is not configured' })
  }

  const target = resolve(request.headers.get('authorization'), config)
  if (!target) return json(401, { ok: false, error: 'Unauthorized' })
  const { connector, ref } = target
  // Never log the token; a short ref prefix is enough to find the destination.
  const tag = `[${connector.id}:${ref.slice(0, 8)}]`

  let payload
  try {
    payload = await parsePayload(request)
  } catch (err) {
    if (err instanceof PayloadError) return json(400, { ok: false, error: err.message })
    throw err
  }

  try {
    const { id, skipped } = await connector.deliver({ fields: payload.fields, image: payload.image }, ref, process.env)
    if (skipped.length) console.warn(`${tag} ${id} saved without fields the destination refused: ${skipped.join(', ')}`)
    return json(200, { ok: true, id, ...(skipped.length && { skipped }) })
  } catch (err) {
    console.error(`${tag} delivery failed:`, (err as Error).message)
    if (err instanceof ConfigError) return json(500, { ok: false, error: 'Server is not configured' })
    const id = err instanceof DeliveryError ? err.id : undefined
    return json(502, { ok: false, ...(id && { id }), error: 'Delivery failed' })
  }
}
