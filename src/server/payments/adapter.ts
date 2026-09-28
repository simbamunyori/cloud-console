import type { Money } from "@/lib/domain/money";

/**
 * A card payment gateway: DPO Pay (dpo.ts) in production, the test page
 * in stub-card.ts for development and demos. EFT is not an adapter: see
 * eft.ts.
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

/** What the console knows about a payment when it asks the gateway about it. */
export interface PaymentCheck {
  paymentRef: string;
  /** The gateway's own id for the transaction, when it gave one. */
  gatewayToken?: string | null;
  /** What was asked for, so a gateway answer for a different amount is not taken as paid. */
  amount: Money;
}

export interface PaymentAdapter {
  /** The payment method name recorded against the invoice payment. */
  readonly gateway: string;
  startCardPayment(charge: CardCharge): Promise<{ redirectUrl: string; gatewayToken?: string }>;
  /** Asks the gateway what happened. Never trusts the return URL alone. */
  confirm(check: PaymentCheck): Promise<PaymentOutcome>;
}
