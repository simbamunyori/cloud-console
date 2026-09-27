import type { ConnectorFamily, Prisma } from "@prisma/client";

/**
 * How an order reaches the vendor or system that delivers it. Each product
 * family has one connector. In Phase 1 every family uses the manual
 * fallback: a task for our staff, and "being set up" with an expected time
 * for the customer. Later phases swap in automatic connectors (Microsoft
 * CSP, Google, Proxmox, DirectAdmin, registrars) family by family, without
 * changing the order flow.
 */

export type ConnectorWork = "provision" | "change_quantity" | "cancel";

export interface ConnectorRequest {
  organisationId: string;
  organisationName: string;
  orderId: string;
  orderReference: string;
  work: ConnectorWork;
  productName: string;
  quantity: number;
  /** Quantity before the change, for change_quantity. */
  previousQuantity?: number;
  /** The customer's choices, by label. */
  options: Record<string, string>;
  /** Service or domain id in the billing engine. */
  billingIds: string[];
  setupHours: number;
}

export interface ConnectorResult {
  mode: "automatic" | "manual";
  /** When the customer is told to expect it. */
  expectedBy: Date;
  taskId?: string;
}

/** The part of a transaction a connector may write to. */
export type ConnectorTx = { provisioningTask: { create: (args: { data: Prisma.ProvisioningTaskUncheckedCreateInput }) => Promise<{ id: string }> } };

export interface ProductConnector {
  readonly family: ConnectorFamily;
  /** Called inside the order's transaction. */
  request(tx: ConnectorTx, request: ConnectorRequest, now: Date): Promise<ConnectorResult>;
}
