import type { OfficialRate, OfficialRateTable, PrismaClient } from "@prisma/client";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { addDays, daysBetween, formatLongDate, parseDateOnly, toDateOnly, todayIn } from "@/lib/dates";
import { divCeil } from "@/lib/domain/money";
import { nextPriceChange, periodOf, priceDay } from "@/lib/domain/pricing";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { bpsText, sendAlert } from "./alerts";

/**
 * Bank of Botswana's daily reference rates. Bank of Botswana publishes
 * "1 BWP = x" for each currency on business days. We fetch the latest
 * table a few times a day, keep each one with its publication date, and
 * work out every rate the price books need from it (USD to BWP, USD to
 * ZAR through the pula, and so on). Values stay as the decimal text
 * published and are divided as whole numbers, never as floats.
 *
 * A table that is broken (a currency missing, a value that isn't a
 * positive number) is never stored. One where a currency jumps by more
 * than MAX_DAILY_MOVE_BPS against the last table in use is stored but
 * held back until an Admin accepts it. Either way the previous rates stay
 * in use and Admins get an email.
 */

export const PULA = "BWP";
/** A day-to-day move this large is far more likely a bad table than a real one. */
export const MAX_DAILY_MOVE_BPS = 1_000;
/** Older than this and the latest table is out of date (weekends and holidays last a few days at most). */
export const STALE_AFTER_DAYS = 5;
/** When the job runs (boss.ts), so alerts can say when it tries again. */
export const CHECK_TIMES = "05:30, 09:30, 13:30 and 17:30";

export interface PublishedRate {
  base: string;
  quote: string;
  /** The decimal text published, e.g. "0.0742". */
  value: string;
}

export interface PublishedTable {
  /** "2026-10-02". */
  publishedOn: string;
  rates: PublishedRate[];
}

/** Where tables come from. One today (AllRatesToday); a direct Bank of Botswana reader would be another. */
export interface RateSource {
  name: string;
  latest(): Promise<PublishedTable>;
}

/** A problem with the source or what it sent. The message is safe to show staff and to email. */
export class RateFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateFetchError";
  }
}

// ─── Exact arithmetic on published decimals ──────────────────────────

interface Ratio {
  n: bigint;
  d: bigint;
}

const DECIMAL = /^\d{1,12}(\.\d{1,12})?$/;

/** "0.0742" as 742/10000, or null if it isn't a positive decimal. */
export function parseDecimal(text: string): Ratio | null {
  const s = text.trim();
  if (!DECIMAL.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const n = BigInt(whole + frac);
  return n > 0n ? { n, d: 10n ** BigInt(frac.length) } : null;
}

/**
 * A JSON number or string as decimal text. A number arrives as the
 * shortest text that reads back as itself, which for a published rate of
 * a dozen digits or fewer is exactly what was published.
 */
export function decimalText(v: unknown): string | null {
  const s = typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" ? v.trim() : "";
  return parseDecimal(s) ? s : null;
}

/** Units of a currency for 1 BWP, from either way round the table prints it. */
function perPula(rates: PublishedRate[], currency: string): Ratio | null {
  if (currency === PULA) return { n: 1n, d: 1n };
  const direct = rates.find((r) => r.base === PULA && r.quote === currency);
  const parsed = direct && parseDecimal(direct.value);
  if (parsed) return parsed;
  const inverse = rates.find((r) => r.base === currency && r.quote === PULA);
  const p = inverse && parseDecimal(inverse.value);
  return p ? { n: p.d, d: p.n } : null;
}

/** 1 base in quote, times 1,000,000, rounded to the nearest, as FxRate stores it. Null if the table lacks either currency. */
export function rateMicros(rates: PublishedRate[], base: string, quote: string): bigint | null {
  const b = perPula(rates, base);
  const q = perPula(rates, quote);
  if (!b || !q) return null;
  // quote per base = (q.n / q.d) / (b.n / b.d)
  const num = q.n * b.d * 1_000_000n;
  const den = q.d * b.n;
  return (2n * num + den) / (2n * den);
}

/** How far a currency moved between two tables, in basis points, rounded up. */
function moveBps(before: Ratio, after: Ratio): bigint {
  const diff = after.n * before.d - before.n * after.d;
  return divCeil((diff < 0n ? -diff : diff) * 10_000n, before.n * after.d);
}

// ─── AllRatesToday ───────────────────────────────────────────────────

const ALLRATESTODAY_LATEST = "https://allratestoday.com/api/v1/central-bank/bob/latest";

/**
 * AllRatesToday's copy of the Bank of Botswana tables
 * (https://allratestoday.com/central-bank-rates-api/bob/). The free plan
 * allows 300 requests a month; we make about 125. The key is a secret
 * (ALLRATESTODAY_API_KEY) and never leaves the server.
 */
export function allRatesToday(apiKey: string, fetcher: typeof fetch = fetch): RateSource {
  return {
    name: "allratestoday",
    async latest() {
      let res: Response;
      try {
        res = await fetcher(ALLRATESTODAY_LATEST, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      } catch (e) {
        throw new RateFetchError(`AllRatesToday didn't answer (${e instanceof Error ? e.message : "network error"}).`);
      }
      if (res.status === 401) throw new RateFetchError("AllRatesToday refused the API key (HTTP 401). Check ALLRATESTODAY_API_KEY on the server.");
      if (res.status === 403) throw new RateFetchError("AllRatesToday says the plan doesn't cover this (HTTP 403).");
      if (res.status === 429) throw new RateFetchError("AllRatesToday's monthly request allowance is used up (HTTP 429).");
      if (!res.ok) throw new RateFetchError(`AllRatesToday answered HTTP ${res.status}.`);
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return parseAllRatesToday(body);
    },
  };
}

/** The latest-table answer: { rate_date, rates: [{ base, quote, type, value, derived }] }. */
export function parseAllRatesToday(body: Record<string, unknown> | null): PublishedTable {
  const data = (body && typeof body.data === "object" && body.data ? body.data : body) as Record<string, unknown> | null;
  const publishedOn = typeof data?.rate_date === "string" ? data.rate_date.slice(0, 10) : "";
  if (!parseDateOnly(publishedOn)) throw new RateFetchError("AllRatesToday's answer has no publication date.");
  if (!Array.isArray(data?.rates)) throw new RateFetchError("AllRatesToday's answer has no rates.");
  const rates: PublishedRate[] = [];
  for (const raw of data.rates as Record<string, unknown>[]) {
    const base = typeof raw?.base === "string" ? raw.base.toUpperCase() : "";
    const quote = typeof raw?.quote === "string" ? raw.quote.toUpperCase() : "";
    const value = decimalText(raw?.value ?? raw?.rate);
    // Only what Bank of Botswana printed: rows the service worked out are left out.
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote) || base === quote || !value || raw?.derived === true) continue;
    if (base !== PULA && quote !== PULA) continue;
    if (rates.some((r) => r.base === base && r.quote === quote)) continue;
    rates.push({ base, quote, value });
  }
  return { publishedOn, rates };
}

// ─── Storing tables ──────────────────────────────────────────────────

type Db = PrismaClient;

/** Every currency the price books convert between: costs, fixed prices and every market's currency. */
export async function neededPairs(db: Pick<PrismaClient, "product" | "tld" | "market">): Promise<{ base: string; quote: string }[]> {
  const [products, tlds, markets] = await Promise.all([
    db.product.findMany({ select: { costCurrency: true, fixedPriceCurrency: true, fixedPriceMinor: true } }),
    db.tld.findMany({ select: { costCurrency: true } }),
    db.market.findMany({ select: { currency: true } }),
  ]);
  const bases = new Set([...products.map((p) => (p.fixedPriceMinor !== null && p.fixedPriceCurrency ? p.fixedPriceCurrency : p.costCurrency)), ...tlds.map((t) => t.costCurrency)]);
  const quotes = new Set(markets.map((m) => m.currency));
  return [...bases].sort().flatMap((base) => [...quotes].sort().filter((quote) => quote !== base).map((quote) => ({ base, quote })));
}

const currenciesOf = (pairs: { base: string; quote: string }[]) => [...new Set(pairs.flatMap((p) => [p.base, p.quote]))].filter((c) => c !== PULA).sort();

export type TableWithRates = OfficialRateTable & { rates: OfficialRate[] };

/** The newest table in use, published on or before a day. */
export function latestTable(db: Pick<PrismaClient, "officialRateTable">, onOrBefore: Date): Promise<TableWithRates | null> {
  return db.officialRateTable.findFirst({ where: { heldBack: null, publishedOn: { lte: onOrBefore } }, orderBy: { publishedOn: "desc" }, include: { rates: true } });
}

export type StoreResult = { kind: "stored"; table: TableWithRates } | { kind: "unchanged" } | { kind: "held-back"; table: TableWithRates; reason: string };

/** Checks a fetched table and keeps it. Throws RateFetchError, storing nothing, when it is broken. */
export async function storeTable(db: Db, fetched: PublishedTable, source: string, now: Date): Promise<StoreResult> {
  const publishedOn = parseDateOnly(fetched.publishedOn);
  const today = todayIn(DEFAULT_TIME_ZONE, now);
  if (!publishedOn || publishedOn > addDays(today, 1)) throw new RateFetchError(`The table's publication date (${fetched.publishedOn}) isn't a real date up to today.`);
  const newest = await db.officialRateTable.findFirst({ orderBy: { publishedOn: "desc" } });
  if (newest && newest.publishedOn >= publishedOn) return { kind: "unchanged" };

  const needed = currenciesOf(await neededPairs(db));
  const missing = needed.filter((c) => !perPula(fetched.rates, c));
  if (missing.length) throw new RateFetchError(`The table published ${fetched.publishedOn} has no usable rate for ${missing.join(", ")}.`);

  const previous = await latestTable(db, publishedOn);
  const jumps = previous
    ? needed.flatMap((c) => {
        const bps = moveBps(perPula(previous.rates, c)!, perPula(fetched.rates, c)!);
        return bps > BigInt(MAX_DAILY_MOVE_BPS) ? [`${c} moved ${bpsText(Number(bps))}% since ${toDateOnly(previous.publishedOn)}`] : [];
      })
    : [];
  const heldBack = jumps.length ? `${jumps.join("; ")}, more than the ${bpsText(MAX_DAILY_MOVE_BPS)}% a day we trust without a check.` : null;

  const table = await db.officialRateTable.create({
    data: { publishedOn, source, fetchedAt: now, heldBack, rates: { create: fetched.rates.map((r) => ({ base: r.base, quote: r.quote, value: r.value })) } },
    include: { rates: true },
  });
  return heldBack ? { kind: "held-back", table, reason: heldBack } : { kind: "stored", table };
}

export interface RatesDeps {
  db: Db;
  /** Null when no source is set up (ALLRATESTODAY_API_KEY unset): rates are then typed at /admin/pricing. */
  source: RateSource | null;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Waits between tries within one run. Later runs (CHECK_TIMES) try again after that. */
  retryDelaysMs?: number[];
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The daily fetch: gets the latest table, retrying a couple of times,
 * stores it if it is new, and emails Admins when the fetch fails, the
 * table is held back, the rates are out of date, or this period's rate has
 * moved past the buffer.
 */
export async function checkRates(deps: RatesDeps): Promise<StoreResult | { kind: "off" } | { kind: "failed"; error: string }> {
  if (!deps.source) return { kind: "off" };
  const now = deps.now?.() ?? new Date();
  const today = toDateOnly(todayIn(DEFAULT_TIME_ZONE, now));
  const delays = deps.retryDelaysMs ?? [30_000, 120_000];
  let lastError = "";
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await (deps.sleep ?? pause)(delays[attempt - 1]);
    try {
      const result = await storeTable(deps.db, await deps.source.latest(), deps.source.name, now);
      await deps.db.pricingSettings.updateMany({ where: { id: "global" }, data: { ratesCheckedAt: now, ratesError: null } });
      await afterFetch(deps.db, result, now);
      return result;
    } catch (e) {
      if (!(e instanceof RateFetchError)) throw e;
      lastError = e.message;
    }
  }
  await deps.db.pricingSettings.updateMany({ where: { id: "global" }, data: { ratesCheckedAt: now, ratesError: lastError } });
  await sendAlert(deps.db, `fetch-failed:${today}`, {
    subject: "We couldn't fetch the Bank of Botswana rates",
    heading: "The exchange rates weren't updated",
    paragraphs: [`${lastError}`, `Prices and the rates already stored stay as they are. We try again at ${CHECK_TIMES} each day.`],
  });
  return { kind: "failed", error: lastError };
}

async function afterFetch(db: Db, result: StoreResult, now: Date) {
  const today = todayIn(DEFAULT_TIME_ZONE, now);
  if (result.kind === "held-back") {
    await sendAlert(db, `held-back:${toDateOnly(result.table.publishedOn)}`, {
      subject: "A Bank of Botswana rate table was held back",
      heading: "New rates are waiting for a check",
      paragraphs: [`The table published ${toDateOnly(result.table.publishedOn)} wasn't used: ${result.reason}`, "The previous rates stay in use. If the move is real, accept the table on the Pricing page."],
    });
  }
  const latest = await latestTable(db, today);
  if (!latest || daysBetween(latest.publishedOn, today) > STALE_AFTER_DAYS) {
    await sendAlert(db, `stale:${toDateOnly(today)}`, {
      subject: "The Bank of Botswana rates are out of date",
      heading: "No new exchange rates for a while",
      paragraphs: [latest ? `The newest table in use was published ${toDateOnly(latest.publishedOn)}.` : "No table is in use yet.", "Prices stay as they are. Check the Pricing page."],
    });
  }
  if (result.kind === "stored") await checkDrift(db, periodOf(priceDay(today)), result.table);
}

/**
 * Prices are fixed for 14 days. When the live rate makes what we pay
 * dearer than this period's rate plus the buffer covers, Admins hear
 * about it, once a period for each pair. A period is keyed by its first
 * day.
 */
export async function checkDrift(db: Db, period: string, table: TableWithRates) {
  const [rates, settings] = await Promise.all([db.fxRate.findMany({ where: { month: period } }), db.pricingSettings.findUnique({ where: { id: "global" } })]);
  const bufferBps = BigInt(settings?.currencyBufferBps ?? 0);
  for (const r of rates) {
    const live = rateMicros(table.rates, r.base, r.quote);
    if (live === null || live * 10_000n <= r.rateMicros * (10_000n + bufferBps)) continue;
    const moved = Number(divCeil((live - r.rateMicros) * 10_000n, r.rateMicros));
    await sendAlert(db, `drift:${period}:${r.base}/${r.quote}`, {
      subject: `The ${r.base} rate has moved past the currency buffer`,
      heading: `1 ${r.base} now buys more ${r.quote} than the current prices allow for`,
      paragraphs: [
        `Bank of Botswana's rate published ${toDateOnly(table.publishedOn)} is ${microsText(live)} ${r.quote}, ${bpsText(moved)}% above the ${microsText(r.rateMicros)} the current prices use. The currency buffer is ${bpsText(Number(bufferBps))}%.`,
        `Prices stay fixed until ${formatLongDate(parseDateOnly(nextPriceChange(period))!)}, when the next price book uses the new rate.`,
      ],
    });
  }
}

/** 13447700n as "13.4477". */
export function microsText(micros: bigint): string {
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Puts a held-back table into use, when an Admin has checked the move is real. Logged. */
export async function acceptTable(deps: { db: Db; staff: StaffActor; now?: () => Date }, tableId: string) {
  assertStaffCan(deps.staff, "managePricing");
  const table = await deps.db.officialRateTable.findUnique({ where: { id: tableId }, include: { rates: true } });
  if (!table) throw new DomainError("not-found", "No such rate table.");
  if (!table.heldBack) return table;
  const accepted = await deps.db.$transaction(async (tx) => {
    const updated = await tx.officialRateTable.update({ where: { id: tableId }, data: { heldBack: null, acceptedById: deps.staff.userId }, include: { rates: true } });
    await tx.staffAuditEvent.create({
      data: {
        actorUserId: deps.staff.userId,
        actorLabel: staffLabel(deps.staff),
        action: "pricing.rates-accepted",
        summary: `Accepted the Bank of Botswana table published ${toDateOnly(table.publishedOn)}, which had been held back`,
        data: { publishedOn: toDateOnly(table.publishedOn), reason: table.heldBack },
      },
    });
    return updated;
  });
  await checkDrift(deps.db, periodOf(priceDay(todayIn(DEFAULT_TIME_ZONE, deps.now?.() ?? new Date()))), accepted);
  return accepted;
}
