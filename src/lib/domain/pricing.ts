import { applyBps, currencyInfo, divCeil, money, type Money } from "./money";

/**
 * Customer prices. The rule from the brief: cost plus a set margin per
 * category; products we pay for in another currency are converted at the
 * month's exchange rate plus a currency buffer. Prices are rounded up to
 * a whole unit (P 190.00, not P 187.43) and fixed for the month.
 */

export interface PriceInputs {
  cost: Money;
  /** A set customer price instead of cost plus margin (our own services). In another currency, `rateMicros` converts it. */
  fixedPrice?: Money | null;
  /** Category margin, basis points. */
  marginBps: number;
  /** Currency buffer, basis points. Only applied when converting. */
  bufferBps: number;
  /** Units of the customer currency per unit of the cost (or fixed price) currency, times 1,000,000. Needed when they differ. */
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

/** An amount in another currency at a rate (times 1,000,000), rounded up to the minor unit. */
function convert(amount: Money, currency: string, rateMicros: bigint | null | undefined): bigint {
  if (!rateMicros || rateMicros <= 0n) throw new PricingError(`There's no ${amount.currency} to ${currency} rate for this month.`);
  const shift = currencyInfo(currency).exponent - currencyInfo(amount.currency).exponent;
  const scaled = amount.amountMinor * rateMicros * 10n ** BigInt(Math.max(0, shift));
  return divCeil(scaled, 1_000_000n * 10n ** BigInt(Math.max(0, -shift)));
}

export function customerPrice(input: PriceInputs, currency: string): { price: Money; breakdown: PriceBreakdown } {
  if (input.marginBps < 0 || input.bufferBps < 0) throw new PricingError("Margin and buffer can't be negative.");
  if (input.fixedPrice) {
    // A set price in another market's currency is converted at the month's
    // rate plus the buffer, with no margin, and rounded up like any price.
    const fixed = input.fixedPrice;
    const converted = fixed.currency === currency ? fixed.amountMinor : convert(fixed, currency, input.rateMicros);
    const bufferBps = fixed.currency === currency ? 0 : input.bufferBps;
    const afterBuffer = converted + applyBps(converted, bufferBps);
    const price = fixed.currency === currency ? afterBuffer : roundUpToUnit(afterBuffer, currency);
    return {
      price: money(price, currency),
      breakdown: {
        cost: fixed.amountMinor.toString(),
        costCurrency: fixed.currency,
        rateMicros: fixed.currency === currency ? null : input.rateMicros!.toString(),
        converted: converted.toString(),
        bufferBps,
        afterBuffer: afterBuffer.toString(),
        marginBps: 0,
        afterMargin: afterBuffer.toString(),
        price: price.toString(),
        fixed: true,
      },
    };
  }
  const converting = input.cost.currency !== currency;
  const converted = converting ? convert(input.cost, currency, input.rateMicros) : input.cost.amountMinor;
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

/**
 * Prices change every 14 days, on a Monday, and quotes are valid for 14
 * days. Prices and rates are looked up by day ("2026-10-06"). Price book
 * entries and rates start on a day (a change day) or, from before
 * fortnightly pricing, a month ("2026-10"). The two kinds of key sort
 * together as text, and a month key sorts as its 1st, so lookups need no
 * conversion.
 */
export const priceDay = (d: Date) => d.toISOString().slice(0, 10);

/** How long prices hold. Quotes say the same. */
export const PRICE_PERIOD_DAYS = 14;
/** The first change day; every PRICE_PERIOD_DAYS from it is another. A Monday. */
export const FIRST_PRICE_CHANGE = "2026-10-12";

const DAY_MS = 86_400_000;
const dayDate = (key: string) => new Date(`${key.length === 7 ? `${key}-01` : key.slice(0, 10)}T00:00:00Z`);

/** The change day on or before a day: the start of its pricing period. */
export function periodOf(dayKey: string): string {
  const epoch = dayDate(FIRST_PRICE_CHANGE).getTime();
  const days = Math.round((dayDate(dayKey).getTime() - epoch) / DAY_MS);
  return priceDay(new Date(epoch + Math.floor(days / PRICE_PERIOD_DAYS) * PRICE_PERIOD_DAYS * DAY_MS));
}

/** The first change day after a day: when a price approved that day takes effect. */
export function nextPriceChange(dayKey: string): string {
  return priceDay(new Date(dayDate(periodOf(dayKey)).getTime() + PRICE_PERIOD_DAYS * DAY_MS));
}

/** The day before a key, "2026-10-11" before "2026-10-12". */
export function dayBefore(dayKey: string): string {
  const d = dayDate(dayKey);
  d.setUTCDate(d.getUTCDate() - 1);
  return priceDay(d);
}
