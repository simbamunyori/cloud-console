import type { PrismaClient } from "@prisma/client";
import type { BillingAdapter } from "@/server/billing/adapter";
import { queueEmail } from "@/server/email/outbox";
import { FEATURES } from "@/server/features/features";

/**
 * Emails each new invoice to the customer (docs/STRATEGY_ROLLOUT.md, U1),
 * once Admin > Features > Invoice emails is on. WHMCS raises the monthly
 * invoices and its own emails stay off (docs/whmcs-setup.md), so this is
 * the only invoice email a customer gets: branded, with the PDF, the bank
 * details and a link to pay. Only invoices dated on or after the day the
 * switch went on are sent, and each only once.
 */

const SEND_STATUSES = new Set(["unpaid", "payment_pending", "paid"]);

/** Who gets the invoice: the billing email, else the owners. */
async function recipients(db: PrismaClient, organisationId: string, billingEmail: string | null) {
  if (billingEmail) return [billingEmail];
  const owners = await db.membership.findMany({ where: { organisationId, role: "OWNER", active: true }, include: { user: { select: { email: true } } } });
  return owners.map((m) => m.user.email);
}

export async function emailNewInvoices(deps: { db: PrismaClient; adapter: BillingAdapter }): Promise<number> {
  const { db } = deps;
  const feature = await db.featureSwitch.findUnique({ where: { key: "invoice-emails" satisfies keyof typeof FEATURES } });
  if (!feature?.enabled) return 0;
  const since = new Date(Date.UTC(feature.updatedAt.getUTCFullYear(), feature.updatedAt.getUTCMonth(), feature.updatedAt.getUTCDate()));
  const accounts = await db.billingAccount.findMany({ where: { organisation: { deletedAt: null } }, include: { organisation: { select: { id: true, billingEmail: true } } } });
  let queued = 0;
  for (const account of accounts) {
    let invoices;
    try {
      invoices = await deps.adapter.listInvoices(account.externalClientId, { from: since });
    } catch (e) {
      console.warn(`Invoice emails: couldn't list invoices for ${account.organisationId}.`, (e as Error).message);
      continue;
    }
    const fresh = invoices.filter((i) => i.issuedOn >= since && SEND_STATUSES.has(i.status));
    if (!fresh.length) continue;
    const sent = new Set((await db.invoiceEmail.findMany({ where: { invoiceId: { in: fresh.map((i) => i.invoiceId) } }, select: { invoiceId: true } })).map((r) => r.invoiceId));
    for (const invoice of fresh.filter((i) => !sent.has(i.invoiceId))) {
      const to = await recipients(db, account.organisationId, account.organisation.billingEmail);
      await db.$transaction(async (tx) => {
        // The row is the claim: a second run finds it and sends nothing.
        const claimed = await tx.invoiceEmail.createMany({ data: [{ invoiceId: invoice.invoiceId, organisationId: account.organisationId }], skipDuplicates: true });
        if (!claimed.count) return;
        for (const address of to) await queueEmail(tx, { organisationId: account.organisationId, to: address, kind: "invoice.issued", payload: { invoiceId: invoice.invoiceId, organisationId: account.organisationId } });
        queued += to.length;
      });
    }
  }
  return queued;
}
