import type { PrismaClient } from "@prisma/client";
import { tenantDb, type TenantDb } from "@/server/db";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import type { BillingAdapter } from "./adapter";
import { BillingError } from "./adapter";
import type { ScopedBilling } from "./scoped";

/**
 * Purchase order numbers. WHMCS has no field for them (docs/whmcs-mapping.md),
 * so the console keeps one per invoice in InvoicePoNumber, shows it on its
 * own invoice view, and copies it into the invoice notes in the engine.
 */

export const PO_MAX = 40;
const PO_PATTERN = /^[\w\-/. #]+$/;

export function normalisePo(input: string): string | null {
  const po = input.trim();
  if (!po) return null;
  if (po.length > PO_MAX) throw new DomainError("invalid", `Keep it to ${PO_MAX} characters.`, "poNumber");
  if (!PO_PATTERN.test(po)) throw new DomainError("invalid", "Use letters, numbers, spaces and - / . # only.", "poNumber");
  return po;
}

/** Sets or clears the PO number on one invoice. Needs the "pay" permission. */
export async function setInvoicePo(db: TenantDb, billing: ScopedBilling, organisationId: string, actor: Actor, invoiceId: string, input: string) {
  assertCan(actor, "pay");
  const po = normalisePo(input);
  const invoice = await billing.getInvoice(invoiceId);
  if (!invoice) throw new DomainError("not-found", "That invoice isn't on your account.");
  if (invoice.status === "cancelled") throw new DomainError("conflict", "This invoice was cancelled.");
  try {
    await billing.setPurchaseOrder(invoiceId, po);
  } catch (e) {
    if (e instanceof BillingError) throw new DomainError("unavailable", "Billing is not answering right now. Try again in a few minutes.");
    throw e;
  }
  await db.$transaction(async (tx) => {
    if (po) {
      await tx.invoicePoNumber.upsert({
        where: { organisationId_invoiceId: { organisationId, invoiceId } },
        update: { poNumber: po },
        create: { organisationId, invoiceId, poNumber: po },
      });
    } else {
      await tx.invoicePoNumber.deleteMany({ where: { invoiceId } });
    }
    await audit(
      tx,
      customerAudit(actor, organisationId, {
        action: po ? "invoice.po_set" : "invoice.po_cleared",
        summary: po ? `Set purchase order ${po} on invoice ${invoice.number}` : `Removed the purchase order from invoice ${invoice.number}`,
        targetType: "Invoice",
        targetId: invoiceId,
      }),
    );
  });
  return po;
}

/** PO numbers for a set of invoices, by invoice id. */
export async function poNumbers(db: TenantDb, invoiceIds: string[]): Promise<Map<string, string>> {
  if (!invoiceIds.length) return new Map();
  const rows = await db.invoicePoNumber.findMany({ where: { invoiceId: { in: invoiceIds } } });
  return new Map(rows.map((r) => [r.invoiceId, r.poNumber]));
}

/**
 * Puts each organisation's default PO number on its new unpaid invoices
 * that don't have one yet. Runs nightly after invoices are raised, so it
 * works the same whether the stub or WHMCS raised them.
 */
export async function applyDefaultPoNumbers(db: PrismaClient, adapter: BillingAdapter) {
  const orgs = await db.organisation.findMany({
    where: { defaultPoNumber: { not: null }, deletedAt: null, billingAccount: { provider: adapter.provider } },
    select: { id: true, defaultPoNumber: true, billingAccount: { select: { externalClientId: true } } },
  });
  let applied = 0;
  for (const org of orgs) {
    const clientId = org.billingAccount!.externalClientId;
    const unpaid = await adapter.listInvoices(clientId, { status: "unpaid" });
    const scoped = tenantDb(org.id);
    const have = await poNumbers(scoped, unpaid.map((i) => i.invoiceId));
    for (const invoice of unpaid.filter((i) => !have.has(i.invoiceId))) {
      await adapter.setPurchaseOrder(invoice.invoiceId, org.defaultPoNumber!);
      await scoped.$transaction(async (tx) => {
        await tx.invoicePoNumber.create({ data: { organisationId: org.id, invoiceId: invoice.invoiceId, poNumber: org.defaultPoNumber! } });
        await audit(tx, {
          organisationId: org.id,
          actorKind: "SYSTEM",
          actorLabel: "Automatic",
          action: "invoice.po_default",
          summary: `Put your default purchase order ${org.defaultPoNumber} on invoice ${invoice.number}`,
          targetType: "Invoice",
          targetId: invoice.invoiceId,
        });
      });
      applied++;
    }
  }
  return applied;
}
