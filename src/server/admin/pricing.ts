import type { PrismaClient } from "@prisma/client";
import { money, type Money } from "@/lib/domain/money";
import { customerPrice, PricingError } from "@/lib/domain/pricing";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";

/**
 * Margin, currency buffer and exchange rate settings. A month's prices are
 * fixed once used, so a change here applies from the next month; any
 * prices already worked out for later months are cleared to be worked out
 * again. Every change is logged with who made it.
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

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

async function clearLaterPrices(db: Pick<PrismaClient, "monthlyPrice">, month: string) {
  await db.monthlyPrice.deleteMany({ where: { month: { gt: month } } });
}

export async function setCategoryMargin(deps: PricingDeps, categoryKey: string, input: string) {
  assertStaffCan(deps.staff, "managePricing");
  const marginBps = parsePercent(input, "margin");
  const category = await deps.db.productCategory.findUnique({ where: { key: categoryKey } });
  if (!category) throw new DomainError("not-found", "No such category.");
  if (category.marginBps === marginBps) return category;
  return deps.db.$transaction(async (tx) => {
    const updated = await tx.productCategory.update({ where: { key: categoryKey }, data: { marginBps } });
    await tx.pricingChange.create({ data: { userId: deps.staff.userId, field: `margin:${categoryKey}`, fromValue: String(category.marginBps), toValue: String(marginBps) } });
    await clearLaterPrices(tx, deps.month);
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
    await clearLaterPrices(tx, deps.month);
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
    await clearLaterPrices(tx, deps.month);
    return rate;
  });
}

async function latestRate(db: PrismaClient, month: string, base: string, quote: string) {
  return db.fxRate.findFirst({ where: { base, quote, month: { lte: month } }, orderBy: { month: "desc" } });
}

export interface PriceRow {
  productId: string;
  name: string;
  categoryName: string;
  cost: Money;
  thisMonth: Money | null;
  nextMonth: Money | null;
}

/** Everything the pricing page shows, including next month's prices worked out from today's settings. */
export async function pricingOverview(db: PrismaClient, month: string, currency = "BWP") {
  const next = nextMonth(month);
  const [categories, settings, stored, changes] = await Promise.all([
    db.productCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { products: { where: { active: true }, orderBy: { sortOrder: "asc" } } } }),
    db.pricingSettings.findUnique({ where: { id: "global" } }),
    db.monthlyPrice.findMany({ where: { month, currency } }),
    db.pricingChange.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { user: { select: { name: true } } } }),
  ]);
  const bufferBps = settings?.currencyBufferBps ?? 0;
  const pairs = [...new Set(categories.flatMap((c) => c.products.map((p) => p.costCurrency)).filter((c) => c !== currency))];
  const rates = await Promise.all(
    pairs.map(async (base) => ({ base, quote: currency, thisMonth: await latestRate(db, month, base, currency), nextMonth: await latestRate(db, next, base, currency) })),
  );
  const storedBy = new Map(stored.map((p) => [p.productId, money(p.amountMinor, currency)]));

  const rows: PriceRow[] = categories.flatMap((c) =>
    c.products.map((p) => {
      let nextPrice: Money | null = null;
      try {
        nextPrice = customerPrice(
          {
            cost: money(p.costMinor, p.costCurrency),
            fixedPrice: p.fixedPriceMinor !== null && p.fixedPriceCurrency ? money(p.fixedPriceMinor, p.fixedPriceCurrency) : null,
            marginBps: c.marginBps,
            bufferBps,
            rateMicros: p.costCurrency === currency ? null : (rates.find((r) => r.base === p.costCurrency)?.nextMonth?.rateMicros ?? null),
          },
          currency,
        ).price;
      } catch (e) {
        if (!(e instanceof PricingError)) throw e;
      }
      return { productId: p.id, name: p.name, categoryName: c.name, cost: money(p.costMinor, p.costCurrency), thisMonth: storedBy.get(p.id) ?? null, nextMonth: nextPrice };
    }),
  );
  return { month, next, categories, bufferBps, rates, rows, changes };
}
