import type { PrismaClient } from "@prisma/client";
import { nextMonth } from "@/server/catalogue/price-book";
export { nextMonth };
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";

/**
 * Margin, currency buffer and exchange rate settings. They only change the
 * suggestions in each market's price book; customers see a new price once
 * staff approve it (price-book.ts). Every change is logged with who made it.
 */

interface PricingDeps {
  db: PrismaClient;
  staff: StaffActor;
  /** The month prices are fixed for now, "2026-09". */
  month: string;
}

/** "20" or "12.5" (percent) to basis points. */
export function parsePercent(input: string, field: string): number {
  const s = input.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) throw new DomainError("invalid", "Enter a percentage like 20 or 12.5.", field);
  const [whole, frac = ""] = s.split(".");
  const bps = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (bps > 50_000) throw new DomainError("invalid", "That's more than 500%.", field);
  return bps;
}

/** "13.45" to a rate times 1,000,000. */
export function parseRate(input: string, field: string): bigint {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(s)) throw new DomainError("invalid", "Enter a rate like 13.45.", field);
  const [whole, frac = ""] = s.split(".");
  const micros = BigInt(whole) * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
  if (micros <= 0n) throw new DomainError("invalid", "A rate must be more than zero.", field);
  return micros;
}

export const bpsToPercent = (bps: number) => (bps / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 });
export const microsToRate = (m: bigint) => (Number(m) / 1_000_000).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export async function setCategoryMargin(deps: PricingDeps, categoryKey: string, input: string) {
  assertStaffCan(deps.staff, "managePricing");
  const marginBps = parsePercent(input, "margin");
  const category = await deps.db.productCategory.findUnique({ where: { key: categoryKey } });
  if (!category) throw new DomainError("not-found", "No such category.");
  if (category.marginBps === marginBps) return category;
  return deps.db.$transaction(async (tx) => {
    const updated = await tx.productCategory.update({ where: { key: categoryKey }, data: { marginBps } });
    await tx.pricingChange.create({ data: { userId: deps.staff.userId, field: `margin:${categoryKey}`, fromValue: String(category.marginBps), toValue: String(marginBps) } });
    return updated;
  });
}

export async function setCurrencyBuffer(deps: PricingDeps, input: string) {
  assertStaffCan(deps.staff, "managePricing");
  const bufferBps = parsePercent(input, "buffer");
  if (bufferBps > 2_000) throw new DomainError("invalid", "A buffer over 20% is almost certainly a mistake.", "buffer");
  const current = await deps.db.pricingSettings.findUnique({ where: { id: "global" } });
  if (current?.currencyBufferBps === bufferBps) return current;
  return deps.db.$transaction(async (tx) => {
    const updated = await tx.pricingSettings.upsert({ where: { id: "global" }, update: { currencyBufferBps: bufferBps }, create: { id: "global", currencyBufferBps: bufferBps } });
    await tx.pricingChange.create({ data: { userId: deps.staff.userId, field: "buffer", fromValue: current ? String(current.currencyBufferBps) : null, toValue: String(bufferBps) } });
    return updated;
  });
}

/** Sets the rate used from next month on. This month's rate is already in this month's prices. */
export async function setNextMonthRate(deps: PricingDeps, base: string, quote: string, input: string) {
  assertStaffCan(deps.staff, "managePricing");
  const rateMicros = parseRate(input, "rate");
  const month = nextMonth(deps.month);
  const current = await deps.db.fxRate.findUnique({ where: { month_base_quote: { month, base, quote } } });
  return deps.db.$transaction(async (tx) => {
    const rate = await tx.fxRate.upsert({
      where: { month_base_quote: { month, base, quote } },
      update: { rateMicros, setById: deps.staff.userId },
      create: { month, base, quote, rateMicros, setById: deps.staff.userId },
    });
    await tx.pricingChange.create({ data: { userId: deps.staff.userId, field: `rate:${base}/${quote}:${month}`, fromValue: current ? String(current.rateMicros) : null, toValue: String(rateMicros) } });
    return rate;
  });
}

async function latestRate(db: PrismaClient, month: string, base: string, quote: string) {
  return db.fxRate.findFirst({ where: { base, quote, month: { lte: month } }, orderBy: { month: "desc" } });
}

/** Settings shared by every market, the rates a market's currency needs, and the change log. */
export async function pricingOverview(db: PrismaClient, month: string, currency: string) {
  const next = nextMonth(month);
  const [categories, settings, products, tlds, changes] = await Promise.all([
    db.productCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    db.pricingSettings.findUnique({ where: { id: "global" } }),
    db.product.findMany({ where: { active: true }, select: { costCurrency: true, fixedPriceCurrency: true, fixedPriceMinor: true } }),
    db.tld.findMany({ select: { costCurrency: true } }),
    db.pricingChange.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { name: true } } } }),
  ]);
  const bases = new Set([...products.map((p) => (p.fixedPriceMinor !== null && p.fixedPriceCurrency ? p.fixedPriceCurrency : p.costCurrency)), ...tlds.map((t) => t.costCurrency)]);
  bases.delete(currency);
  const rates = await Promise.all(
    [...bases].sort().map(async (base) => ({ base, quote: currency, thisMonth: await latestRate(db, month, base, currency), nextMonth: await latestRate(db, next, base, currency) })),
  );
  return { month, next, categories, bufferBps: settings?.currencyBufferBps ?? 0, rates, changes };
}
