import { applyBps, currencyInfo, divCeil, money, type Money } from "./money";

/**
 * Customer prices. The rule from the brief: cost plus a set margin per
 * category; products we pay for in another currency are converted at the
 * month's exchange rate plus a currency buffer. Prices are rounded up to
 * a whole unit (P 190.00, not P 187.43) and fixed for the month.
 */

export interface PriceInputs {
  cost: Money;
  /** A set customer price instead of cost plus margin (our own services). */
  fixedPrice?: Money | null;
  /** Category margin, basis points. */
  marginBps: number;
  /** Currency buffer, basis points. Only applied when converting. */
  bufferBps: number;
  /** Units of the customer currency per unit of the cost currency, times 1,000,000. Needed when they differ. */
  rateMicros?: bigint | null;
}

export interface PriceBreakdown {
  cost: string;
  costCurrency: string;
  rateMicros: string | null;
  converted: string;
  bufferBps: number;
  afterBuffer: string;
  marginBps: number;
  afterMargin: string;
  price: string;
  fixed: boolean;
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

/** Rounds up to a whole unit of the currency. */
export function roundUpToUnit(amountMinor: bigint, currency: string): bigint {
  const unit = 10n ** BigInt(currencyInfo(currency).exponent);
  return divCeil(amountMinor, unit) * unit;
}

export function customerPrice(input: PriceInputs, currency: string): { price: Money; breakdown: PriceBreakdown } {
  if (input.marginBps < 0 || input.bufferBps < 0) throw new PricingError("Margin and buffer can't be negative.");
  if (input.fixedPrice) {
    if (input.fixedPrice.currency !== currency) throw new PricingError(`The fixed price is in ${input.fixedPrice.currency}, not ${currency}.`);
    const p = input.fixedPrice.amountMinor.toString();
    return {
      price: input.fixedPrice,
      breakdown: { cost: input.cost.amountMinor.toString(), costCurrency: input.cost.currency, rateMicros: null, converted: p, bufferBps: 0, afterBuffer: p, marginBps: 0, afterMargin: p, price: p, fixed: true },
    };
  }
  const converting = input.cost.currency !== currency;
  let converted = input.cost.amountMinor;
  if (converting) {
    if (!input.rateMicros || input.rateMicros <= 0n) throw new PricingError(`There's no ${input.cost.currency} to ${currency} rate for this month.`);
    const shift = currencyInfo(currency).exponent - currencyInfo(input.cost.currency).exponent;
    const scaled = input.cost.amountMinor * input.rateMicros * 10n ** BigInt(Math.max(0, shift));
    converted = divCeil(scaled, 1_000_000n * 10n ** BigInt(Math.max(0, -shift)));
  }
  const bufferBps = converting ? input.bufferBps : 0;
  const afterBuffer = converted + applyBps(converted, bufferBps);
  const afterMargin = afterBuffer + applyBps(afterBuffer, input.marginBps);
  const price = roundUpToUnit(afterMargin, currency);
  return {
    price: money(price, currency),
    breakdown: {
      cost: input.cost.amountMinor.toString(),
      costCurrency: input.cost.currency,
      rateMicros: converting ? input.rateMicros!.toString() : null,
      converted: converted.toString(),
      bufferBps,
      afterBuffer: afterBuffer.toString(),
      marginBps: input.marginBps,
      afterMargin: afterMargin.toString(),
      price: price.toString(),
      fixed: false,
    },
  };
}

/** "2026-09" for the month a date falls in. */
export const monthOf = (d: Date) => d.toISOString().slice(0, 7);
