import type { ConnectorFamily } from "@prisma/client";
import type { ProductConnector } from "./connector";
import { ManualConnector } from "./manual";

/** One connector per product family. Phase 1: all manual. */
const CONNECTORS: Record<ConnectorFamily, ProductConnector> = {
  PRODUCTIVITY: new ManualConnector("PRODUCTIVITY"),
  PUBLIC_CLOUD: new ManualConnector("PUBLIC_CLOUD"),
  SERVERS: new ManualConnector("SERVERS"),
  WEB_AND_DOMAINS: new ManualConnector("WEB_AND_DOMAINS"),
  PROTECTION: new ManualConnector("PROTECTION"),
  OUR_SOFTWARE: new ManualConnector("OUR_SOFTWARE"),
  SERVICES: new ManualConnector("SERVICES"),
  CONNECTIVITY: new ManualConnector("CONNECTIVITY"),
};

export function connectorFor(family: ConnectorFamily): ProductConnector {
  return CONNECTORS[family];
}
