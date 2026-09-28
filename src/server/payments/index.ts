import "server-only";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { requireSecret } from "@/server/secrets";
import type { PaymentAdapter } from "./adapter";
import { DpoGateway } from "./dpo";
import { StubCardGateway } from "./stub-card";

let adapter: PaymentAdapter | undefined;

/** The card gateway, chosen by PAYMENT_ADAPTER: DPO Pay, or the test page. */
export function paymentAdapter(): PaymentAdapter {
  if (!adapter) {
    const e = env();
    if (e.PAYMENT_ADAPTER === "dpo") {
      if (!e.DPO_SERVICE_TYPE) throw new Error("DPO_SERVICE_TYPE is not set.");
      adapter = new DpoGateway({ apiUrl: e.DPO_API_URL, payUrl: e.DPO_PAY_URL, companyToken: requireSecret("DPO_COMPANY_TOKEN"), serviceType: e.DPO_SERVICE_TYPE, gateway: e.DPO_WHMCS_GATEWAY });
    } else {
      adapter = new StubCardGateway(prisma);
    }
  }
  return adapter;
}
