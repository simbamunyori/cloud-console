import type { PrismaClient } from "@prisma/client";
import { money } from "@/lib/domain/money";
import { PAYMENT_METHODS } from "@/server/billing/adapter";
import { DomainError } from "@/server/org/access";
import type { CardCharge, PaymentAdapter, PaymentCheck, PaymentOutcome } from "./adapter";

/**
 * A pretend card company for development and demos. Its "hosted payment
 * page" is /stub-gateway/[ref]. Test card numbers:
 *   4242 4242 4242 4242  pays
 *   4000 0000 0000 0002  is declined
 *   4000 0000 0000 9995  is declined for lack of funds
 * Any other number that passes the Luhn check pays.
 */

export const STUB_CARDS = { pays: "4242424242424242", declined: "4000000000000002", noFunds: "4000000000009995" } as const;

type StubDb = Pick<PrismaClient, "stubCardCharge">;

export class StubCardGateway implements PaymentAdapter {
  readonly gateway = PAYMENT_METHODS.card;

  constructor(private readonly db: StubDb) {}

  async startCardPayment(charge: CardCharge) {
    await this.db.stubCardCharge.create({
      data: { id: charge.paymentRef, amountMinor: charge.amount.amountMinor, currency: charge.amount.currency, description: charge.description, returnUrl: charge.returnUrl },
    });
    return { redirectUrl: `/stub-gateway/${encodeURIComponent(charge.paymentRef)}` };
  }

  async confirm({ paymentRef }: PaymentCheck): Promise<PaymentOutcome> {
    const charge = await this.db.stubCardCharge.findUnique({ where: { id: paymentRef } });
    if (!charge || charge.status === "pending") return { status: "pending" };
    if (charge.status === "succeeded") return { status: "succeeded", paidAt: charge.updatedAt, lastFour: charge.lastFour ?? undefined };
    const reasons: Record<string, string> = {
      no_funds: "The card company says there isn't enough money on the card.",
      cancelled: "The payment was cancelled before it went through.",
    };
    return { status: "failed", reason: reasons[charge.status] ?? "The card company declined the card." };
  }
}

// ─── The stub's own payment page ─────────────────────────────────────

export async function stubCharge(db: StubDb, ref: string) {
  const charge = await db.stubCardCharge.findUnique({ where: { id: ref } });
  return charge ? { ...charge, amount: money(charge.amountMinor, charge.currency) } : null;
}

function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Takes the card details on the stub's page and decides the outcome. Returns where to send the payer. */
export async function stubPay(db: StubDb, ref: string, card: { number: string; expiry: string; cvc: string }, now = new Date()): Promise<string> {
  const charge = await db.stubCardCharge.findUnique({ where: { id: ref } });
  if (!charge) throw new DomainError("not-found", "This payment has expired. Go back and start again.");
  if (charge.status !== "pending") return charge.returnUrl;

  const number = card.number.replace(/[\s-]/g, "");
  const fieldErrors: Record<string, string> = {};
  if (!/^\d{12,19}$/.test(number) || !luhn(number)) fieldErrors.number = "Check the card number.";
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(card.expiry.trim());
  const month = m ? Number(m[1]) : 0;
  const endOfMonth = m ? new Date(Date.UTC(2000 + Number(m[2]), month, 1)) : null;
  if (!m || month < 1 || month > 12 || !endOfMonth || endOfMonth <= now) fieldErrors.expiry = "Enter a date in the future, like 08/29.";
  if (!/^\d{3,4}$/.test(card.cvc.trim())) fieldErrors.cvc = "Enter the 3 or 4 digits on the back.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the card details.", undefined, fieldErrors);

  const status = number === STUB_CARDS.declined ? "declined" : number === STUB_CARDS.noFunds ? "no_funds" : "succeeded";
  await db.stubCardCharge.updateMany({ where: { id: ref, status: "pending" }, data: { status, lastFour: number.slice(-4) } });
  return charge.returnUrl;
}

/** The payer gave up on the stub's page. */
export async function stubCancel(db: StubDb, ref: string): Promise<string | null> {
  const charge = await db.stubCardCharge.findUnique({ where: { id: ref } });
  if (!charge) return null;
  await db.stubCardCharge.updateMany({ where: { id: ref, status: "pending" }, data: { status: "cancelled" } });
  return charge.returnUrl;
}
