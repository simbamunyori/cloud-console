import type { EftPayment, PrismaClient } from "@prisma/client";
import { addDays, formatDay, parseDateOnly, todayIn } from "@/lib/dates";
import { company } from "@/config/app";
import { formatMoney, money, MoneyParseError, parseMoney, toJson } from "@/lib/domain/money";
import { BillingError, PAYMENT_METHODS, type BillingAdapter } from "@/server/billing/adapter";
import { scopedBilling } from "@/server/billing/scoped";
import type { TenantDb } from "@/server/db";
import { queueEmail } from "@/server/email/outbox";
import { assertCan, DomainError } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";
import { payableInvoice, paymentRecipients, type PaymentDeps } from "./card";

/**
 * Paying by bank transfer (EFT). The customer pays from their bank with
 * the invoice number as the reference and tells us here; staff check the
 * bank statement and confirm it, which records the payment in the
 * billing engine. Nothing is credited on the customer's word alone.
 */

export interface EftReport {
  amount: string;
  paidOn: string;
  reference: string;
}

/** The customer says they've paid an invoice by EFT. */
export async function reportEftPayment(deps: Omit<PaymentDeps, "payments" | "appUrl"> & { organisation: { timeZone: string } }, invoiceId: string, input: EftReport): Promise<EftPayment> {
  assertCan(deps.actor, "pay");
  const invoice = await payableInvoice(deps.billing, invoiceId);
  const currency = invoice.balance.currency;
  const fieldErrors: Record<string, string> = {};

  let amountMinor = 0n;
  try {
    amountMinor = parseMoney(input.amount, currency, deps.organisation.locale);
    if (amountMinor <= 0n) fieldErrors.amount = "Enter the amount you paid.";
    else if (amountMinor > invoice.balance.amountMinor) fieldErrors.amount = `That's more than the ${formatMoney(invoice.balance, deps.organisation.locale)} left to pay.`;
  } catch (e) {
    if (!(e instanceof MoneyParseError)) throw e;
    fieldErrors.amount = "Enter an amount, like 1,250.00.";
  }
  const today = todayIn(deps.organisation.timeZone, deps.now);
  const paidOn = parseDateOnly(input.paidOn);
  if (!paidOn) fieldErrors.paidOn = "Enter the date you paid.";
  else if (paidOn > today) fieldErrors.paidOn = "That date is in the future.";
  else if (paidOn < addDays(invoice.issuedOn, -7)) fieldErrors.paidOn = `That's before the invoice was issued on ${formatDay(invoice.issuedOn, true)}.`;
  const reference = input.reference.trim().slice(0, 60);
  if (!reference) fieldErrors.reference = "Enter the reference you used, usually the invoice number.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the payment details.", undefined, fieldErrors);

  const waiting = await deps.db.eftPayment.findFirst({ where: { invoiceId: invoice.invoiceId, status: "AWAITING_CONFIRMATION" } });
  if (waiting) throw new DomainError("conflict", `You told us about a payment for this invoice on ${formatDay(waiting.createdAt, true)}. We're still checking it.`);

  const amount = money(amountMinor, currency);
  return deps.db.$transaction(async (tx) => {
    const eft = await tx.eftPayment.create({
      data: { organisationId: deps.organisation.id, invoiceId: invoice.invoiceId, amountMinor, currency, reference, paidOn: paidOn!, reportedById: deps.actor.userId },
    });
    await audit(
      tx,
      customerAudit(deps.actor, deps.organisation.id, {
        action: "payment.eft_reported",
        summary: `Told us ${formatMoney(amount, deps.organisation.locale)} was paid by bank transfer for invoice ${invoice.number}`,
        targetType: "Invoice",
        targetId: invoice.invoiceId,
        data: { eftPaymentId: eft.id, reference },
      }),
    );
    return eft;
  });
}

// ─── Staff side ──────────────────────────────────────────────────────

export interface StaffPaymentDeps {
  db: PrismaClient;
  adapter: BillingAdapter;
  staff: StaffActor;
  now?: Date;
}

async function awaiting(db: PrismaClient, eftPaymentId: string) {
  const eft = await db.eftPayment.findUnique({ where: { id: eftPaymentId }, include: { organisation: true } });
  if (!eft) throw new DomainError("not-found", "No such payment.");
  if (eft.status !== "AWAITING_CONFIRMATION") throw new DomainError("conflict", "Someone has already dealt with this payment.");
  return eft;
}

/**
 * Staff have seen the money in the bank. Records it against the invoice,
 * tells the customer, and writes it to their audit log. The amount can be
 * corrected to what actually arrived.
 */
export async function confirmEftPayment(deps: StaffPaymentDeps, eftPaymentId: string, input: { amountReceived?: string } = {}) {
  assertStaffCan(deps.staff, "confirmPayments");
  const eft = await awaiting(deps.db, eftPaymentId);
  let amountMinor = eft.amountMinor;
  if (input.amountReceived?.trim()) {
    try {
      amountMinor = parseMoney(input.amountReceived, eft.currency, company.staffLocale);
    } catch (e) {
      if (!(e instanceof MoneyParseError)) throw e;
      throw new DomainError("invalid", "Enter an amount, like 1,250.00.", "amountReceived");
    }
    if (amountMinor <= 0n) throw new DomainError("invalid", "Enter the amount that arrived, or reject the payment.", "amountReceived");
  }
  const amount = money(amountMinor, eft.currency);
  const billing = await scopedBilling(deps.db, deps.adapter, eft.organisationId);
  const invoice = await billing.getInvoice(eft.invoiceId);
  if (!invoice) throw new DomainError("not-found", "The invoice is no longer there.");
  if (amountMinor > invoice.balance.amountMinor) throw new DomainError("invalid", `That's more than the ${formatMoney(invoice.balance, eft.organisation.locale)} left on invoice ${invoice.number}.`, "amountReceived");

  const now = deps.now ?? new Date();
  const claimed = await deps.db.eftPayment.updateMany({
    where: { id: eft.id, status: "AWAITING_CONFIRMATION" },
    data: { status: "CONFIRMED", confirmedById: deps.staff.userId, decidedAt: now, amountMinor },
  });
  if (!claimed.count) throw new DomainError("conflict", "Someone has already dealt with this payment.");
  try {
    await billing.recordPayment(eft.invoiceId, { amount, gateway: PAYMENT_METHODS.eft, reference: eft.reference, paidAt: eft.paidOn });
  } catch (e) {
    await deps.db.eftPayment.update({ where: { id: eft.id }, data: { status: "AWAITING_CONFIRMATION", confirmedById: null, decidedAt: null, amountMinor: eft.amountMinor } });
    if (e instanceof BillingError) throw new DomainError("conflict", e.message);
    throw e;
  }

  const to = await paymentRecipients(deps.db as unknown as TenantDb, eft.reportedById, eft.organisation.billingEmail);
  await deps.db.$transaction(async (tx) => {
    await audit(tx, staffAudit(deps.staff, eft.organisationId, {
      action: "payment.eft_confirmed",
      summary: `Confirmed ${formatMoney(amount, eft.organisation.locale)} received by bank transfer for invoice ${invoice.number}`,
      targetType: "Invoice",
      targetId: eft.invoiceId,
      data: { eftPaymentId: eft.id, reported: { ...toJson(money(eft.amountMinor, eft.currency)) } },
    }));
    for (const email of to) {
      await queueEmail(tx, {
        organisationId: eft.organisationId,
        to: email,
        kind: "payment.confirmed",
        payload: { invoiceId: eft.invoiceId, invoiceNumber: invoice.number, amount: { ...toJson(amount) }, method: "Bank transfer" },
      });
    }
  });
  return deps.db.eftPayment.findUniqueOrThrow({ where: { id: eft.id } });
}

/** Staff can't find the money. The customer is told why, in the note. */
export async function rejectEftPayment(deps: StaffPaymentDeps, eftPaymentId: string, note: string) {
  assertStaffCan(deps.staff, "confirmPayments");
  const reason = note.trim().slice(0, 500);
  if (!reason) throw new DomainError("invalid", "Say what the customer should check, for example the date or the reference.", "note");
  const eft = await awaiting(deps.db, eftPaymentId);
  const billing = await scopedBilling(deps.db, deps.adapter, eft.organisationId);
  const invoice = await billing.getInvoice(eft.invoiceId);
  const number = invoice?.number ?? eft.invoiceId;
  const amount = money(eft.amountMinor, eft.currency);
  const to = await paymentRecipients(deps.db as unknown as TenantDb, eft.reportedById, eft.organisation.billingEmail);

  return deps.db.$transaction(async (tx) => {
    const claimed = await tx.eftPayment.updateMany({
      where: { id: eft.id, status: "AWAITING_CONFIRMATION" },
      data: { status: "REJECTED", confirmedById: deps.staff.userId, decidedAt: deps.now ?? new Date(), staffNote: reason },
    });
    if (!claimed.count) throw new DomainError("conflict", "Someone has already dealt with this payment.");
    await audit(tx, staffAudit(deps.staff, eft.organisationId, {
      action: "payment.eft_not_found",
      summary: `Couldn't find the ${formatMoney(amount, eft.organisation.locale)} bank transfer for invoice ${number}: ${reason}`,
      targetType: "Invoice",
      targetId: eft.invoiceId,
      data: { eftPaymentId: eft.id },
    }));
    for (const email of to) {
      await queueEmail(tx, {
        organisationId: eft.organisationId,
        to: email,
        kind: "payment.eft_not_found",
        payload: { invoiceId: eft.invoiceId, invoiceNumber: number, amount: { ...toJson(amount) }, paidOn: eft.paidOn.toISOString(), note: reason },
      });
    }
    return tx.eftPayment.findUniqueOrThrow({ where: { id: eft.id } });
  });
}
