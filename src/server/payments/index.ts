import "server-only";
import { prisma } from "@/server/db";
import type { PaymentAdapter } from "./adapter";
import { StubCardGateway } from "./stub-card";

let adapter: PaymentAdapter | undefined;

/** The card gateway, chosen by PAYMENT_ADAPTER. Only the stub exists until a gateway is chosen. */
export function paymentAdapter(): PaymentAdapter {
  adapter ??= new StubCardGateway(prisma);
  return adapter;
}
