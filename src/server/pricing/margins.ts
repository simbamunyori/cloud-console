import type { PrismaClient } from "@prisma/client";
import { money, type Money } from "@/lib/domain/money";
import { convertAt } from "@/lib/domain/pricing";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { approvedPrice, productItem, trueCost } from "@/server/catalogue/price-book";
import { includedProtectionOn, inclusionsByPlan } from "@/server/catalogue/inclusions";
import { effectiveStatus } from "@/server/catalogue/visibility";
import { parsePercent } from "@/server/admin/pricing";

/**
 * The plan margin report at /admin/pricing (docs/STRATEGY_ROLLOUT.md, U3):
 * for every plan (each product that includes others, and the business
 * plans) in every market, its true cost at today's rates, its price and
 * the margin, with a warning below the floor an Admin sets. The cost
 * counts what a plan includes whether or not the feature is on yet, so
 * the report can be read before customers see the inclusions.
 */

export interface MarginRow {
  slug: string;
  name: string;
  unitLabel: string;
  status: string;
  included: string[];
  /** Our cost for one unit in the market's currency, at today's rate with no buffer. */
  cost: Money | null;
  price: Money | null;
  marginBps: number | null;
  belowFloor: boolean;
  problem?: string;
}

export interface MarketMargins {
  code: string;
  name: string;
  currency: string;
  rows: MarginRow[];
}

type Db = Pick<PrismaClient, "product" | "productInclusion" | "priceBookEntry" | "fxRate" | "market" | "pricingSettings" | "featureSwitch">;

async function rateFor(db: Pick<PrismaClient, "fxRate">, day: string, base: string, quote: string) {
  return (
    (await db.fxRate.findFirst({ where: { base, quote, month: { lte: day } }, orderBy: { month: "desc" } })) ??
    (await db.fxRate.findFirst({ where: { base, quote, month: { gt: day } }, orderBy: { month: "asc" } }))
  );
}

export async function planMargins(db: Db, day: string): Promise<{ floorBps: number; featureOn: boolean; markets: MarketMargins[] }> {
  const [settings, markets, featureOn, inclusions] = await Promise.all([
    db.pricingSettings.findUnique({ where: { id: "global" } }),
    db.market.findMany({ orderBy: { sortOrder: "asc" } }),
    includedProtectionOn(db),
    inclusionsByPlan(db),
  ]);
  const floorBps = settings?.marginFloorBps ?? 1500;
  const plans = await db.product.findMany({
    where: { OR: [{ id: { in: [...inclusions.keys()] } }, { categoryKey: "plans" }] },
    include: { category: { include: { family: true } } },
    orderBy: [{ category: { family: { sortOrder: "asc" } } }, { category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  const result: MarketMargins[] = [];
  for (const m of markets) {
    const rows: MarginRow[] = [];
    for (const p of plans.filter((p) => p.markets.includes(m.code))) {
      const included = inclusions.get(p.id) ?? [];
      const own = money(p.costMinor, p.costCurrency);
      const row: MarginRow = {
        slug: p.slug,
        name: p.name,
        unitLabel: p.unitLabel,
        status: effectiveStatus(p, p.category.family),
        included: included.map((i) => (i.quantity > 1 ? `${i.included.name} (${i.quantity})` : i.included.name)),
        cost: null,
        price: await approvedPrice(db, m, productItem(p.slug), day),
        marginBps: null,
        belowFloor: false,
      };
      const cost = await trueCost(db, day, own, included);
      if (typeof cost === "string") row.problem = cost;
      else if (cost.currency === m.currency) row.cost = cost;
      else {
        const rate = await rateFor(db, day, cost.currency, m.currency);
        if (rate) row.cost = money(convertAt(cost, m.currency, rate.rateMicros), m.currency);
        else row.problem = `There's no ${cost.currency} to ${m.currency} rate.`;
      }
      if (row.cost && row.price && row.price.amountMinor > 0n) {
        row.marginBps = Number(((row.price.amountMinor - row.cost.amountMinor) * 10_000n) / row.price.amountMinor);
        row.belowFloor = row.marginBps < floorBps;
      }
      if (!row.problem && included.some((i) => i.included.costMinor === 0n)) row.problem = "An included product has no cost set yet.";
      rows.push(row);
    }
    result.push({ code: m.code, name: m.name, currency: m.currency, rows });
  }
  return { floorBps, featureOn, markets: result };
}

/** The margin below which the report warns. Logged like every pricing change. */
export async function setMarginFloor(deps: { db: PrismaClient; staff: StaffActor }, input: string) {
  assertStaffCan(deps.staff, "managePricing");
  const bps = parsePercent(input, "floor");
  if (bps >= 10_000) throw new DomainError("invalid", "A margin floor must be under 100%.", "floor");
  const current = await deps.db.pricingSettings.findUnique({ where: { id: "global" } });
  if (!current) throw new DomainError("invalid", "Set the currency buffer first.", "floor");
  if (current.marginFloorBps === bps) return current;
  return deps.db.$transaction(async (tx) => {
    const updated = await tx.pricingSettings.update({ where: { id: "global" }, data: { marginFloorBps: bps } });
    await tx.pricingChange.create({ data: { userId: deps.staff.userId, field: "margin-floor", fromValue: String(current.marginFloorBps), toValue: String(bps) } });
    return updated;
  });
}
