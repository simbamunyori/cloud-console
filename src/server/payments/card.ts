import { randomBytes } from "node:crypto";
import type { CardPayment } from "@prisma/client";
import { formatMoney, money, toJson } from "@/lib/domain/money";
import { BillingError, type Invoice } from "@/server/billing/adapter";
import type { ScopedBilling } from "@/server/billing/scoped";
import type { TenantDb } from "@/server/db";
import { queueEmail } from "@/server/email/outbox";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import type { PaymentAdapter } from "./adapter";

/**
 * Paying an invoice by card: we record the attempt, send the payer to the
 * gateway, and when they come back we ask the gateway what happened. Only
 * then is the payment recorded against the invoice in the billing engine.
 */

export interface PaymentDeps {
  db: TenantDb;
  billing: ScopedBilling;
  organisation: { id: string; billingEmail?: string | null; locale: string };
  actor: Actor;
  payments: PaymentAdapter;
  appUrl: string;
  now?: Date;
}

/** Whether an invoice can be paid now. */
export const isPayable = (i: Pick<Invoice, "status" | "balance">) => (i.status === "unpaid" || i.status === "payment_pending") && i.balance.amountMinor > 0n;

export async function payableInvoice(billing: ScopedBilling, invoiceId: string) {
  const invoice = await billing.getInvoice(invoiceId);
  if (!invoice) throw new DomainError("not-found", "That invoice isn't on your account.");
  if (!isPayable(invoice)) throw new DomainError("conflict", `Invoice ${invoice.number} has nothing left to pay.`);
  return invoice;
}

/** Who hears that a payment went through: the person who paid, and the billing address if there is one. */
export async function paymentRecipients(db: TenantDb, userId: string, billingEmail?: string | null) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  return [...new Set([user?.email, billingEmail ?? undefined].filter((e): e is string => Boolean(e)).map((e) => e.toLowerCase()))];
}

/** Starts a card payment for what is left on an invoice. Returns where to send the payer. */
export async function startCardPayment(deps: PaymentDeps, invoiceId: string): Promise<{ redirectUrl: string; payment: CardPayment }> {
  assertCan(deps.actor, "pay");
  const invoice = await payableInvoice(deps.billing, invoiceId);
  const paymentRef = `CP-${randomBytes(12).toString("base64url")}`;
  const payment = await deps.db.cardPayment.create({
    data: {
      organisationId: deps.organisation.id,
      invoiceId: invoice.invoiceId,
      amountMinor: invoice.balance.amountMinor,
      currency: invoice.balance.currency,
      gateway: deps.payments.gateway,
      gatewayRef: paymentRef,
      startedById: deps.actor.userId,
    },
  });
  const { redirectUrl } = await deps.payments.startCardPayment({
    paymentRef,
    amount: invoice.balance,
    description: `Invoice ${invoice.number}`,
    returnUrl: `${deps.appUrl}/app/billing/card-return?ref=${encodeURIComponent(paymentRef)}`,
  });
  return { redirectUrl, payment };
}

/**
 * Settles a card payment after the payer comes back. Safe to call more
 * than once: the payment is claimed with a conditional update, so the
 * invoice is only ever credited once.
 */
export async function finishCardPayment(deps: Omit<PaymentDeps, "appUrl">, paymentRef: string): Promise<CardPayment> {
  const payment = await deps.db.cardPayment.findFirst({ where: { gatewayRef: paymentRef } });
  if (!payment) throw new DomainError("not-found", "We couldn't find that payment.");
  if (payment.status !== "STARTED") return payment;

  const outcome = await deps.payments.confirm(paymentRef);
  if (outcome.status === "pending") return payment;
  const amount = money(payment.amountMinor, payment.currency);

  if (outcome.status === "failed") {
    return deps.db.$transaction(async (tx) => {
      const claimed = await tx.cardPayment.updateMany({ where: { id: payment.id, status: "STARTED" }, data: { status: "FAILED", failureReason: outcome.reason } });
      if (claimed.count) {
        await audit(tx, customerAudit(deps.actor, deps.organisation.id, { action: "payment.card_failed", summary: `A card payment of ${formatMoney(amount, deps.organisation.locale)} didn't go through`, targetType: "Invoice", targetId: payment.invoiceId, data: { reason: outcome.reason } }));
      }
      return tx.cardPayment.findUniqueOrThrow({ where: { id: payment.id } });
    });
  }

  const claimed = await deps.db.cardPayment.updateMany({ where: { id: payment.id, status: "STARTED" }, data: { status: "SUCCEEDED" } });
  if (!claimed.count) return deps.db.cardPayment.findUniqueOrThrow({ where: { id: payment.id } });
  try {
    await deps.billing.recordPayment(payment.invoiceId, { amount, gateway: deps.payments.gateway, reference: paymentRef, paidAt: outcome.paidAt });
  } catch (e) {
    // The card was charged but the invoice didn't take it, e.g. it was
    // paid another way meanwhile. Leave it for staff to settle or refund.
    const reason = e instanceof BillingError ? `The card was charged but the invoice couldn't take the payment: ${e.message}` : "The card was charged but recording it failed.";
    await deps.db.cardPayment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: reason } });
    await audit(deps.db, customerAudit(deps.actor, deps.organisation.id, { action: "payment.card_unapplied", summary: `A card payment of ${formatMoney(amount, deps.organisation.locale)} needs our team to apply it`, targetType: "Invoice", targetId: payment.invoiceId, data: { paymentRef } }));
    throw new DomainError("conflict", "Your card was charged, but we couldn't apply it to the invoice. Our team has been told and will sort it out or refund you.");
  }

  const invoice = await deps.billing.getInvoice(payment.invoiceId);
  const number = invoice?.number ?? payment.invoiceId;
  const to = await paymentRecipients(deps.db, payment.startedById, deps.organisation.billingEmail);
  return deps.db.$transaction(async (tx) => {
    await audit(
      tx,
      customerAudit(deps.actor, deps.organisation.id, {
        action: "payment.card_paid",
        summary: `Paid ${formatMoney(amount, deps.organisation.locale)} by card for invoice ${number}${outcome.lastFour ? ` (card ending ${outcome.lastFour})` : ""}`,
        targetType: "Invoice",
        targetId: payment.invoiceId,
        data: { paymentRef },
      }),
    );
    for (const email of to) {
      await queueEmail(tx, {
        organisationId: deps.organisation.id,
        to: email,
        kind: "payment.confirmed",
        payload: { invoiceId: payment.invoiceId, invoiceNumber: number, amount: { ...toJson(amount) }, method: outcome.lastFour ? `Card ending ${outcome.lastFour}` : "Card" },
      });
    }
    return tx.cardPayment.findUniqueOrThrow({ where: { id: payment.id } });
  });
}
