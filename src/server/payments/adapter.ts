import type { Money } from "@/lib/domain/money";

/**
 * A card payment gateway. No gateway has been chosen yet, so Phase 1 runs
 * on the stub in stub-card.ts; a real gateway implements the same two
 * calls. EFT is not an adapter: see eft.ts.
 */

export interface CardCharge {
  /** Our reference for the payment, unique per attempt. */
  paymentRef: string;
  amount: Money;
  /** What the card company shows the payer, e.g. "Invoice INV-2026-0012". */
  description: string;
  /** Where the gateway sends the payer back to, with the outcome to be checked. */
  returnUrl: string;
}

export type PaymentOutcome =
  | { status: "succeeded"; paidAt: Date; lastFour?: string }
  | { status: "failed"; reason: string }
  /** The payer hasn't finished yet, or the gateway hasn't decided. */
  | { status: "pending" };

export interface PaymentAdapter {
  /** The payment method name recorded against the invoice payment. */
  readonly gateway: string;
  startCardPayment(charge: CardCharge): Promise<{ redirectUrl: string }>;
  /** Asks the gateway what happened. Never trusts the return URL alone. */
  confirm(paymentRef: string): Promise<PaymentOutcome>;
}
