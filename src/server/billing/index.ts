import "server-only";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { requireSecret, secret } from "@/server/secrets";
import type { BillingAdapter } from "./adapter";
import { scopedBilling } from "./scoped";
import { StubBillingAdapter } from "./stub/stub-adapter";
import { WhmcsClient } from "./whmcs/client";
import { WhmcsBillingAdapter } from "./whmcs/whmcs-adapter";

let adapter: BillingAdapter | undefined;

/**
 * The unbound adapter, chosen by BILLING_ADAPTER. Customer code uses
 * billingFor() in scoped.ts instead; this is for staff code (which audits
 * what it does), jobs and set-up.
 */
export function billingAdapter(): BillingAdapter {
  if (!adapter) {
    const e = env();
    if (e.BILLING_ADAPTER === "whmcs") {
      if (!e.WHMCS_API_URL) throw new Error("WHMCS_API_URL is not set.");
      adapter = new WhmcsBillingAdapter(
        new WhmcsClient({ url: e.WHMCS_API_URL, identifier: requireSecret("WHMCS_IDENTIFIER"), secret: requireSecret("WHMCS_SECRET"), accessKey: secret("WHMCS_ACCESS_KEY") }),
      );
    } else {
      adapter = new StubBillingAdapter(prisma);
    }
  }
  return adapter;
}

/** For tests. */
export function useBillingAdapter(next: BillingAdapter | undefined) {
  adapter = next;
}

/** The billing adapter for the signed-in organisation. Pages use this. */
export function billingFor(organisationId: string) {
  return scopedBilling(prisma, billingAdapter(), organisationId);
}
