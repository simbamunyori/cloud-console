import "server-only";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { requireSecret, secret } from "@/server/secrets";
import type { BillingAdapter } from "./adapter";
import { scopedBilling } from "./scoped";
import { StubBillingAdapter } from "./stub/stub-adapter";
import { WhmcsClient } from "./whmcs/client";
import { WhmcsBillingAdapter } from "./whmcs/whmcs-adapter";
import { runSync, syncUrlFor } from "./whmcs/price-sync";
import { companyPushUrlFor, pushCompany } from "./whmcs/company-push";
import { linkStubProduct } from "./stub/catalogue";
import type { StaffActor } from "@/server/staff/access";

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
        new WhmcsClient({ url: e.WHMCS_API_URL, identifier: requireSecret("WHMCS_API_IDENTIFIER"), secret: requireSecret("WHMCS_API_SECRET"), accessKey: secret("WHMCS_ACCESS_KEY") }),
        { sendToRegistrar: e.WHMCS_ENVIRONMENT === "production" },
      );
    } else {
      adapter = new StubBillingAdapter(prisma);
    }
  }
  return adapter;
}

/**
 * Gives catalogue products a product in billing, for the Odoo import: the
 * stub links each one; WHMCS runs the price sync (docs/whmcs-setup.md,
 * section 6), as the admin who approved the import.
 */
export async function linkProductsToBilling(slugs: string[], staff: StaffActor) {
  const a = billingAdapter();
  if (a instanceof StubBillingAdapter) {
    for (const slug of slugs) await linkStubProduct(prisma, slug);
    return;
  }
  const e = env();
  if (!e.WHMCS_API_URL) throw new Error("WHMCS_API_URL is not set.");
  const whmcs = new WhmcsClient({ url: e.WHMCS_API_URL, identifier: requireSecret("WHMCS_API_IDENTIFIER"), secret: requireSecret("WHMCS_API_SECRET"), accessKey: secret("WHMCS_ACCESS_KEY") });
  const report = await runSync({ db: prisma, whmcs, syncUrl: e.WHMCS_SYNC_URL ?? syncUrlFor(e.WHMCS_API_URL), syncSecret: requireSecret("WHMCS_SYNC_SECRET") }, { apply: true, staff });
  if (report.plan.problems.length) throw new Error(`The price sync can't run: ${report.plan.problems.join(" ")}`);
}

/**
 * Sends the price books in effect to WHMCS, for the monthly price book
 * (src/server/pricing/monthly.ts). Undefined with the stub, which reads
 * the price books directly.
 */
export function priceSyncer(): ((actor: { staff: StaffActor } | { system: string }) => Promise<void>) | undefined {
  if (billingAdapter() instanceof StubBillingAdapter) return undefined;
  return async (actor) => {
    const e = env();
    if (!e.WHMCS_API_URL) throw new Error("WHMCS_API_URL is not set.");
    const whmcs = new WhmcsClient({ url: e.WHMCS_API_URL, identifier: requireSecret("WHMCS_API_IDENTIFIER"), secret: requireSecret("WHMCS_API_SECRET"), accessKey: secret("WHMCS_ACCESS_KEY") });
    const report = await runSync({ db: prisma, whmcs, syncUrl: e.WHMCS_SYNC_URL ?? syncUrlFor(e.WHMCS_API_URL), syncSecret: requireSecret("WHMCS_SYNC_SECRET") }, { apply: true, ...actor });
    if (report.plan.problems.length) throw new Error(`The price sync can't run: ${report.plan.problems.join(" ")}`);
  };
}

/**
 * Sends Admin > Company to WHMCS (src/server/billing/whmcs/company-push.ts).
 * Undefined with the stub, which has no WHMCS to tidy.
 */
export function companyPusher(): ((staff: StaffActor, apply: boolean) => ReturnType<typeof pushCompany>) | undefined {
  if (billingAdapter() instanceof StubBillingAdapter) return undefined;
  return (staff, apply) => {
    const e = env();
    if (!e.WHMCS_API_URL) throw new Error("WHMCS_API_URL is not set.");
    const url = e.WHMCS_SYNC_URL ? e.WHMCS_SYNC_URL.replace(/sync\.php$/, "company.php") : companyPushUrlFor(e.WHMCS_API_URL);
    return pushCompany({ db: prisma, url, secret: requireSecret("WHMCS_SYNC_SECRET"), appUrl: e.APP_URL, mailFrom: e.MAIL_FROM }, staff, { apply });
  };
}

/** For tests. */
export function useBillingAdapter(next: BillingAdapter | undefined) {
  adapter = next;
}

/** The billing adapter for the signed-in organisation. Pages use this. */
export function billingFor(organisationId: string) {
  return scopedBilling(prisma, billingAdapter(), organisationId);
}
