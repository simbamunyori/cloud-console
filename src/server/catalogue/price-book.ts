import { Prisma, type CatalogueStatus, type PriceBookEntry, type PrismaClient, type Product, type ProductCategory } from "@prisma/client";
import { money, parseMoney, MoneyParseError, type Money } from "@/lib/domain/money";
import { customerPrice, PricingError, type PriceBreakdown } from "@/lib/domain/pricing";
import { company } from "@/config/app";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { DOMAIN_PRODUCT_SLUG } from "./seed-data";
import { effectiveStatus, shownTo, shownWhere, type Audience, type WithFamily } from "./visibility";

/**
 * Each market has a price book: the prices staff approved, in the
 * market's currency. The Phase 1 rule (cost, month's rate, buffer and
 * margin, rounded up to a whole unit) only suggests a price. Customers
 * see approved prices and nothing else, and a product without one isn't
 * offered in that market.
 *
 * An approved price applies from a month until a later one replaces it.
 * Prices in effect are fixed for the month: staff approve changes for
 * next month. The one exception is something with no price in a market
 * yet, which can be priced from this month, since no customer has seen a
 * price for it.
 */

type Db = Pick<PrismaClient, "priceBookEntry" | "product" | "productCategory" | "tld" | "fxRate" | "pricingSettings" | "market">;

export interface MarketRef {
  code: string;
  currency: string;
}

export const productItem = (slug: string) => `product:${slug}`;
export const tldItem = (tld: string) => `tld:${tld}`;

/** The entries in effect in a month, latest per item. */
export async function bookFor(db: Pick<PrismaClient, "priceBookEntry">, marketCode: string, month: string): Promise<Map<string, PriceBookEntry>> {
  const rows = await db.priceBookEntry.findMany({ where: { marketCode, month: { lte: month } }, orderBy: { month: "asc" } });
  return new Map(rows.map((r) => [r.item, r]));
}

function entryMoney(entry: PriceBookEntry | undefined | null, market: MarketRef): Money | null {
  // A book in another currency can't be charged: the market's currency changed.
  if (!entry || entry.currency !== market.currency) return null;
  return money(entry.amountMinor, entry.currency);
}

/** Whether a product is on sale in a market to an audience (see visibility.ts). */
export const offeredIn = (p: Pick<Product, "markets"> & WithFamily, marketCode: string, audience: Audience = "public") => shownTo(p, audience) && p.markets.includes(marketCode);

/** The approved price for an item in a market in a month, whether or not it is still offered to new customers. */
export async function approvedPrice(db: Pick<PrismaClient, "priceBookEntry">, market: MarketRef, item: string, month: string): Promise<Money | null> {
  const entry = await db.priceBookEntry.findFirst({ where: { marketCode: market.code, item, month: { lte: month } }, orderBy: { month: "desc" } });
  return entryMoney(entry, market);
}

/** A product's price per unit per month in a market, or null if it isn't offered there. */
export async function productPrice(db: Pick<PrismaClient, "priceBookEntry">, product: Pick<Product, "slug" | "markets"> & WithFamily, market: MarketRef, month: string, audience: Audience = "public"): Promise<Money | null> {
  return offeredIn(product, market.code, audience) ? approvedPrice(db, market, productItem(product.slug), month) : null;
}

export interface TldOffer {
  tld: string;
  register: Money;
  renew: Money;
}

/** Domain endings on sale in a market, the market's own endings first. */
export async function tldOffers(db: Db, market: MarketRef & { highlightedTlds?: string[] }, month: string): Promise<TldOffer[]> {
  const [tlds, book] = await Promise.all([db.tld.findMany({ where: { markets: { has: market.code } }, orderBy: { sortOrder: "asc" } }), bookFor(db, market.code, month)]);
  const first = market.highlightedTlds ?? [];
  const rank = (t: string) => (first.includes(t) ? first.indexOf(t) : first.length);
  return tlds
    .flatMap((t) => {
      const entry = book.get(tldItem(t.tld));
      const register = entryMoney(entry, market);
      if (!register || entry?.renewMinor == null) return [];
      return [{ tld: t.tld, register, renew: money(entry.renewMinor, entry.currency) }];
    })
    .sort((a, b) => rank(a.tld) - rank(b.tld));
}

export interface PricedProduct {
  product: Product & { category: ProductCategory };
  price: Money;
}

/**
 * Everything on sale in a market, by category, at the prices in effect
 * this month. Our own test organisations (audience "internal") also see
 * internal products. Products sold by quote come with a null price.
 */
export async function marketplace(db: Db, market: MarketRef, month: string, audience: Audience = "public") {
  const [categories, book] = await Promise.all([
    db.productCategory.findMany({
      where: { family: { status: { in: audience === "internal" ? ["INTERNAL", "LIVE"] : ["LIVE"] } } },
      orderBy: [{ family: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      include: { products: { where: { ...shownWhere(audience), slug: { not: DOMAIN_PRODUCT_SLUG }, markets: { has: market.code } }, orderBy: { sortOrder: "asc" } } },
    }),
    bookFor(db, market.code, month),
  ]);
  return categories.flatMap(({ products, ...category }) => {
    // Products sold by quote have no price; they show with a way to ask for one.
    const priced = products.flatMap((product) => {
      if (product.fulfilment === "QUOTE") return [{ product: { ...product, category }, price: null as Money | null }];
      const price = entryMoney(book.get(productItem(product.slug)), market);
      return price ? [{ product: { ...product, category }, price: price as Money | null }] : [];
    });
    return priced.length ? [{ category, products: priced }] : [];
  });
}

// ─── Suggestions and approval (staff) ────────────────────────────────

/** "2026-10" after "2026-09". */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * The rate for pricing a month: the latest set for that month or before.
 * A market priced for the first time mid-month may only have next month's
 * rate, so that is used when there is nothing earlier.
 */
async function rateFor(db: Pick<PrismaClient, "fxRate">, month: string, base: string, quote: string) {
  const upTo = await db.fxRate.findFirst({ where: { base, quote, month: { lte: month } }, orderBy: { month: "desc" } });
  return upTo ?? (await db.fxRate.findFirst({ where: { base, quote, month: { gt: month } }, orderBy: { month: "asc" } }));
}

export interface Suggestion {
  price: Money;
  renew?: Money;
  breakdown: PriceBreakdown;
}

export interface BookRow {
  item: string;
  kind: "product" | "tld";
  name: string;
  group: string;
  offered: boolean;
  /** A product's status with its family's taken into account; domains are always live. */
  status: CatalogueStatus;
  cost: Money;
  /** In effect this month. */
  current: Money | null;
  currentRenew?: Money | null;
  /** Approved for the target month, if it differs from what's in effect. */
  scheduled: Money | null;
  scheduledRenew?: Money | null;
  /** The month an approval now would apply from. */
  targetMonth: string;
  suggestion: Suggestion | null;
  /** Why there's no suggestion, e.g. a missing rate. */
  problem?: string;
}

async function suggestFor(db: Db, month: string, currency: string, inputs: { cost: Money; fixedPrice?: Money | null; marginBps: number; bufferBps: number }): Promise<Suggestion | string> {
  const base = inputs.fixedPrice ? inputs.fixedPrice.currency : inputs.cost.currency;
  const rate = base === currency ? null : await rateFor(db, month, base, currency);
  try {
    const { price, breakdown } = customerPrice({ ...inputs, rateMicros: rate?.rateMicros ?? null }, currency);
    return { price, breakdown };
  } catch (e) {
    if (e instanceof PricingError) return e.message;
    throw e;
  }
}

/** Everything the pricing page shows for one market. */
export async function bookRows(db: Db, marketCode: string, month: string): Promise<{ rows: BookRow[]; market: { code: string; currency: string; name: string } }> {
  const market = await db.market.findUnique({ where: { code: marketCode } });
  if (!market) throw new DomainError("not-found", "No such market.");
  const next = nextMonth(month);
  const [categories, tlds, settings, current, upToNext] = await Promise.all([
    // Drafts are priced too, so a product can be priced before it goes live.
    db.productCategory.findMany({ orderBy: [{ family: { sortOrder: "asc" } }, { sortOrder: "asc" }], include: { family: true, products: { where: { slug: { not: DOMAIN_PRODUCT_SLUG } }, orderBy: { sortOrder: "asc" } } } }),
    db.tld.findMany({ orderBy: { sortOrder: "asc" } }),
    db.pricingSettings.findUnique({ where: { id: "global" } }),
    bookFor(db, marketCode, month),
    bookFor(db, marketCode, next),
  ]);
  const bufferBps = settings?.currencyBufferBps ?? 0;
  const domainMargin = (await db.product.findUnique({ where: { slug: DOMAIN_PRODUCT_SLUG }, include: { category: true } }))?.category.marginBps ?? 0;
  const rows: BookRow[] = [];

  for (const c of categories) {
    for (const p of c.products) {
      const item = productItem(p.slug);
      const now = entryMoney(current.get(item), market);
      const targetMonth = now ? next : month;
      const later = upToNext.get(item);
      const scheduled = later && later.month > month ? entryMoney(later, market) : null;
      const fixedPrice = p.fixedPriceMinor !== null && p.fixedPriceCurrency ? money(p.fixedPriceMinor, p.fixedPriceCurrency) : null;
      const s = await suggestFor(db, targetMonth, market.currency, { cost: money(p.costMinor, p.costCurrency), fixedPrice, marginBps: c.marginBps, bufferBps });
      rows.push({
        item,
        kind: "product",
        name: p.name,
        group: c.name,
        offered: p.markets.includes(marketCode),
        status: effectiveStatus(p, c.family),
        cost: fixedPrice ?? money(p.costMinor, p.costCurrency),
        current: now,
        scheduled,
        targetMonth,
        suggestion: typeof s === "string" ? null : s,
        problem: typeof s === "string" ? s : undefined,
      });
    }
  }
  for (const t of tlds) {
    const item = tldItem(t.tld);
    const entry = current.get(item);
    const now = entryMoney(entry, market);
    const targetMonth = now ? next : month;
    const later = upToNext.get(item);
    const scheduled = later && later.month > month ? entryMoney(later, market) : null;
    const reg = await suggestFor(db, targetMonth, market.currency, { cost: money(t.costRegisterMinor, t.costCurrency), marginBps: domainMargin, bufferBps });
    const ren = await suggestFor(db, targetMonth, market.currency, { cost: money(t.costRenewMinor, t.costCurrency), marginBps: domainMargin, bufferBps });
    const suggestion = typeof reg === "string" || typeof ren === "string" ? null : { price: reg.price, renew: ren.price, breakdown: reg.breakdown };
    rows.push({
      item,
      kind: "tld",
      status: "LIVE",
      name: t.tld,
      group: "Domain names, a year",
      offered: t.markets.includes(marketCode),
      cost: money(t.costRegisterMinor, t.costCurrency),
      current: now,
      currentRenew: entry?.renewMinor != null && now ? money(entry.renewMinor, entry.currency) : null,
      scheduled,
      scheduledRenew: scheduled && later?.renewMinor != null ? money(later.renewMinor, later.currency) : null,
      targetMonth,
      suggestion,
      problem: typeof reg === "string" ? reg : typeof ren === "string" ? ren : undefined,
    });
  }
  return { rows, market: { code: market.code, currency: market.currency, name: market.name } };
}

interface PricingDeps {
  db: PrismaClient;
  staff: StaffActor;
  /** The month prices are fixed for now, "2026-09". */
  month: string;
}

function readAmount(input: string | undefined, currency: string, field: string): bigint | null {
  if (!input?.trim()) return null;
  try {
    const v = parseMoney(input, currency, company.staffLocale);
    if (v < 0n) throw new DomainError("invalid", "A price can't be negative.", field);
    return v;
  } catch (e) {
    if (e instanceof MoneyParseError) throw new DomainError("invalid", "Enter an amount like 190 or 190.00.", field);
    throw e;
  }
}

/**
 * Approves a price in a market's book: the suggestion, or an amount staff
 * type instead. It applies from the row's target month. Logged.
 */
export async function approvePrice(deps: PricingDeps, marketCode: string, item: string, input: { amount?: string; renew?: string } = {}) {
  assertStaffCan(deps.staff, "managePricing");
  const { rows, market } = await bookRows(deps.db, marketCode, deps.month);
  const row = rows.find((r) => r.item === item);
  if (!row) throw new DomainError("not-found", "No such product or domain ending.");
  const amount = readAmount(input.amount, market.currency, "amount") ?? row.suggestion?.price.amountMinor ?? null;
  const renew = row.kind === "tld" ? (readAmount(input.renew, market.currency, "renew") ?? row.suggestion?.renew?.amountMinor ?? null) : null;
  if (amount === null || (row.kind === "tld" && renew === null)) throw new DomainError("invalid", row.problem ?? "There's no suggestion yet. Enter a price.", "amount");
  const previous = row.scheduled ?? row.current;

  return deps.db.$transaction(async (tx) => {
    const data = {
      currency: market.currency,
      amountMinor: amount,
      renewMinor: renew,
      suggestedMinor: row.suggestion?.price.amountMinor ?? null,
      breakdown: row.suggestion ? (row.suggestion.breakdown as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      approvedById: deps.staff.userId,
      approvedAt: new Date(),
    };
    const entry = await tx.priceBookEntry.upsert({
      where: { marketCode_item_month: { marketCode, item, month: row.targetMonth } },
      update: data,
      create: { marketCode, item, month: row.targetMonth, ...data },
    });
    await tx.pricingChange.create({
      data: {
        userId: deps.staff.userId,
        field: `price:${marketCode}:${item}:${row.targetMonth}`,
        fromValue: previous ? previous.amountMinor.toString() : null,
        toValue: amount.toString(),
      },
    });
    return entry;
  });
}

/** Whether a row's suggestion differs from what is already approved for it. */
export function awaitingApproval(r: BookRow): boolean {
  if (!r.offered || !r.suggestion) return false;
  const approved = r.scheduled ?? r.current;
  const renewApproved = r.scheduled ? r.scheduledRenew : r.currentRenew;
  return approved?.amountMinor !== r.suggestion.price.amountMinor || (r.kind === "tld" && renewApproved?.amountMinor !== r.suggestion.renew?.amountMinor);
}

/** Approves every suggestion that differs from what is already approved. Returns how many. */
export async function approveAllSuggestions(deps: PricingDeps, marketCode: string) {
  assertStaffCan(deps.staff, "managePricing");
  const { rows } = await bookRows(deps.db, marketCode, deps.month);
  let count = 0;
  for (const r of rows) {
    if (!awaitingApproval(r)) continue;
    await approvePrice(deps, marketCode, r.item);
    count++;
  }
  return count;
}

/** Offers or withdraws a product or domain ending in a market, from now. Logged. */
export async function setOffered(deps: Omit<PricingDeps, "month">, marketCode: string, item: string, offered: boolean) {
  assertStaffCan(deps.staff, "managePricing");
  const market = await deps.db.market.findUnique({ where: { code: marketCode } });
  if (!market) throw new DomainError("not-found", "No such market.");
  const [kind, key] = [item.slice(0, item.indexOf(":")), item.slice(item.indexOf(":") + 1)];
  const toggle = (markets: string[]) => (offered ? [...new Set([...markets, marketCode])] : markets.filter((m) => m !== marketCode));

  return deps.db.$transaction(async (tx) => {
    let before: string[];
    if (kind === "product") {
      const p = await tx.product.findUnique({ where: { slug: key } });
      if (!p) throw new DomainError("not-found", "No such product.");
      before = p.markets;
      await tx.product.update({ where: { slug: key }, data: { markets: toggle(p.markets) } });
    } else if (kind === "tld") {
      const t = await tx.tld.findUnique({ where: { tld: key } });
      if (!t) throw new DomainError("not-found", "No such domain ending.");
      before = t.markets;
      await tx.tld.update({ where: { tld: key }, data: { markets: toggle(t.markets) } });
    } else throw new DomainError("not-found", "No such item.");
    if (before.includes(marketCode) !== offered) {
      await tx.pricingChange.create({ data: { userId: deps.staff.userId, field: `offered:${marketCode}:${item}`, fromValue: String(!offered), toValue: String(offered) } });
    }
  });
}

