/**
 * Money is always an integer count of minor units (thebe for pula, cents
 * for dollars) held in a bigint, and always travels with its currency
 * code. Floats never touch an amount.
 */

export type Minor = bigint;

export interface Money {
  amountMinor: Minor;
  /** ISO 4217, e.g. "BWP". */
  currency: string;
}

interface CurrencyInfo {
  /** Digits after the decimal point. */
  exponent: number;
  /** What goes before the amount on screen. */
  prefix: string;
}

const CURRENCIES: Record<string, CurrencyInfo> = {
  BWP: { exponent: 2, prefix: "P" },
  ZAR: { exponent: 2, prefix: "R" },
  USD: { exponent: 2, prefix: "US$" },
  ZWG: { exponent: 2, prefix: "ZiG" },
  EUR: { exponent: 2, prefix: "€" },
};

export function currencyInfo(currency: string): CurrencyInfo {
  const info = CURRENCIES[currency];
  if (!info) throw new Error(`Unsupported currency ${currency}.`);
  return info;
}

export function isSupportedCurrency(currency: string): boolean {
  return currency in CURRENCIES;
}

export function money(amountMinor: Minor, currency: string): Money {
  currencyInfo(currency);
  return { amountMinor, currency };
}

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot combine ${a} and ${b} amounts.`);
    this.name = "CurrencyMismatchError";
  }
}

function same(a: Money, b: Money) {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  same(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  same(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function times(a: Money, quantity: number | bigint): Money {
  const q = BigInt(quantity);
  return { amountMinor: a.amountMinor * q, currency: a.currency };
}

/** Adds up amounts in one currency. An empty list is zero in `currency`. */
export function total(amounts: Iterable<Money>, currency: string): Money {
  let sum = 0n;
  for (const a of amounts) {
    if (a.currency !== currency) throw new CurrencyMismatchError(currency, a.currency);
    sum += a.amountMinor;
  }
  return { amountMinor: sum, currency };
}

export function sum(amounts: Iterable<Minor>): Minor {
  let t = 0n;
  for (const a of amounts) t += a;
  return t;
}

/** Integer division rounding half away from zero. */
export function divRound(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("Division by zero.");
  const negative = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return negative ? -q : q;
}

/** Integer division rounding up (towards positive infinity). */
export function divCeil(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error("Divisor must be positive.");
  return n >= 0n ? (n + d - 1n) / d : -(-n / d);
}

/** Basis points: 10,000 is 100%. Rounds half away from zero. */
export function applyBps(amount: Minor, bps: number | bigint): Minor {
  return divRound(amount * BigInt(bps), 10_000n);
}

export class MoneyParseError extends Error {
  constructor(input: string, reason: string) {
    super(`Cannot read "${input}" as an amount: ${reason}`);
    this.name = "MoneyParseError";
  }
}

/**
 * Parses what a person types ("12,400", "P 12 400.5", "12400.50") into
 * minor units. Rejects more decimals than the currency has rather than
 * rounding.
 */
export function parseMoney(input: string, currency = "BWP"): Minor {
  const { exponent } = currencyInfo(currency);
  const raw = input.trim();
  let s = raw;
  let negative = false;
  if (/^[-−]/.test(s)) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/^(BWP|ZAR|USD|US\$|P|R|\$)\s*/i, "");
  if (!negative && /^[-−]/.test(s)) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/[\s,  ]/g, "");
  const pattern = new RegExp(`^\\d+(\\.\\d{0,${exponent}})?$`);
  if (!pattern.test(s)) {
    throw new MoneyParseError(raw, new RegExp(`\\.\\d{${exponent + 1},}$`).test(s) ? "too many decimal places" : "not a number");
  }
  const [whole, frac = ""] = s.split(".");
  const scale = 10n ** BigInt(exponent);
  const value = BigInt(whole) * scale + BigInt((frac + "0".repeat(exponent)).slice(0, exponent) || "0");
  return negative ? -value : value;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface FormatOptions {
  /** Always show a sign, e.g. "+P 1.00" for a credit. */
  signed?: boolean;
  /** Hide the currency prefix, for dense table columns. */
  bare?: boolean;
}

/**
 * "P 12,400.00". Negative amounts use a true minus sign (U+2212), never
 * brackets.
 */
export function formatMoney(m: Money, opts: FormatOptions = {}): string {
  const { exponent, prefix } = currencyInfo(m.currency);
  const amount = m.amountMinor;
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const scale = 10n ** BigInt(exponent);
  const whole = groupThousands((abs / scale).toString());
  const frac = exponent ? `.${(abs % scale).toString().padStart(exponent, "0")}` : "";
  const pre = opts.bare ? "" : `${prefix} `;
  const sign = negative ? "−" : opts.signed && amount > 0n ? "+" : "";
  return `${sign}${pre}${whole}${frac}`;
}

/** Plain JSON for money crossing to the browser, where bigint can't go. */
export interface MoneyJson {
  amountMinor: string;
  currency: string;
}

export function toJson(m: Money): MoneyJson {
  return { amountMinor: m.amountMinor.toString(), currency: m.currency };
}

export function fromJson(j: MoneyJson): Money {
  if (!/^-?\d+$/.test(j.amountMinor)) throw new Error("Invalid amount.");
  return money(BigInt(j.amountMinor), j.currency);
}
