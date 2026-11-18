import { airtable } from './airtable/index.js'
import type { Connector } from './types.js'

/**
 * Every connector the gateway can deliver to. To add one, copy
 * connectors/_template, then import it and add it here (see CONTRIBUTING.md).
 */
export const CONNECTORS: readonly Connector[] = [airtable]

export const getConnector = (id: string): Connector | undefined => CONNECTORS.find((c) => c.id === id)
