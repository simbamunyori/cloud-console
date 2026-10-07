import type { PrismaClient } from "@prisma/client";
import { money, type Money } from "@/lib/domain/money";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { featureOn } from "@/server/features/features";

/**
 * Security and backup included in plans (docs/STRATEGY_ROLLOUT.md, U3).
 * Each Microsoft 365, Google Workspace and hosting plan includes catalogue
 * products at no extra charge, set by staff in the catalogue. Each included
 * product keeps its own cost, so a plan's true cost is its own plus what it
 * includes. Customers see the inclusions, orders set them up and the price
 * book counts their cost only while Admin > Features > "Security and backup
 * included in plans" is on.
 */

export interface Inclusion {
  planId: string;
  quantity: number;
  included: { id: string; slug: string; name: string; summary: string; unitLabel: string; costMinor: bigint; costCurrency: string; categoryKey: string };
}

type InclusionDb = Pick<PrismaClient, "productInclusion">;

const INCLUDED = { select: { id: true, slug: true, name: true, summary: true, unitLabel: true, costMinor: true, costCurrency: true, categoryKey: true } } as const;

/** Every plan's inclusions, in order, keyed by the plan's product id. */
export async function inclusionsByPlan(db: InclusionDb, planIds?: string[]): Promise<Map<string, Inclusion[]>> {
  const rows = await db.productInclusion.findMany({
    where: planIds ? { planId: { in: planIds } } : undefined,
    orderBy: [{ planId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: { included: INCLUDED },
  });
  const map = new Map<string, Inclusion[]>();
  for (const r of rows) map.set(r.planId, [...(map.get(r.planId) ?? []), { planId: r.planId, quantity: r.quantity, included: r.included }]);
  return map;
}

export const includedProtectionOn = (db: Pick<PrismaClient, "featureSwitch">) => featureOn(db, "included-protection");

/** What customers are told a product includes: nothing while the feature is off. */
export async function shownInclusions(db: InclusionDb & Pick<PrismaClient, "featureSwitch">, productId: string): Promise<{ name: string; summary: string }[]> {
  if (!(await includedProtectionOn(db))) return [];
  return ((await inclusionsByPlan(db, [productId])).get(productId) ?? []).map((i) => ({ name: i.included.name, summary: i.included.summary }));
}

/** What customers are told each product includes, by its slug: nothing while the feature is off. */
export async function shownInclusionsBySlug(db: InclusionDb & Pick<PrismaClient, "featureSwitch">, slugs: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!slugs.length || !(await includedProtectionOn(db))) return map;
  const rows = await db.productInclusion.findMany({
    where: { plan: { slug: { in: slugs } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { plan: { select: { slug: true } }, included: { select: { name: true } } },
  });
  for (const r of rows) map.set(r.plan.slug, [...(map.get(r.plan.slug) ?? []), r.included.name]);
  return map;
}

/** A product's "What's included" list with what comes at no extra charge first. */
export const withIncluded = (includes: string[], names: string[]) => [...names.map((n) => `${n} at no extra charge`), ...includes];

/** What an order for a product also sets up, with each included product's connector: nothing while the feature is off. */
export async function includedToSetUp(db: InclusionDb & Pick<PrismaClient, "featureSwitch">, productId: string) {
  if (!(await includedProtectionOn(db))) return [];
  return db.productInclusion.findMany({
    where: { planId: productId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { quantity: true, included: { select: { slug: true, name: true, setupHours: true, category: { select: { family: { select: { connector: true } } } } } } },
  });
}

/** Words for a list of included products: "Email security and Backup for Microsoft 365". */
export function includedWords(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The included products' cost for one unit of the plan, in their own currencies. */
export function includedCosts(inclusions: Inclusion[]): Money[] {
  return inclusions.map((i) => money(i.included.costMinor * BigInt(i.quantity), i.included.costCurrency));
}

// ─── Staff: what a plan includes, set in the catalogue ─────────────

function audit(tx: Pick<PrismaClient, "staffAuditEvent">, staff: StaffActor, action: string, summary: string, data: Record<string, unknown>) {
  return tx.staffAuditEvent.create({ data: { actorUserId: staff.userId, actorLabel: staff.name, action, summary, data: data as object } });
}

/** Adds a product to a plan, or changes how many come with each unit. Audited. */
export async function setInclusion(deps: { db: PrismaClient; staff: StaffActor }, planSlug: string, includedSlug: string, rawQuantity: string | number) {
  assertStaffCan(deps.staff, "manageCatalogue");
  const quantity = Number(rawQuantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new DomainError("invalid", "Enter a whole number from 1 to 100.", "quantity");
  const [plan, included] = await Promise.all([deps.db.product.findUnique({ where: { slug: planSlug } }), deps.db.product.findUnique({ where: { slug: includedSlug } })]);
  if (!plan) throw new DomainError("not-found", "No such product.");
  if (!included) throw new DomainError("invalid", "Choose a product to include.", "included");
  if (plan.id === included.id) throw new DomainError("invalid", "A product can't include itself.", "included");
  // One level only: a product that includes others can't itself be included, so a plan's cost is never counted twice.
  if (await deps.db.productInclusion.count({ where: { planId: included.id } })) throw new DomainError("invalid", `${included.name} includes other products itself, so it can't be included.`, "included");
  if (await deps.db.productInclusion.count({ where: { includedId: plan.id } })) throw new DomainError("invalid", `${plan.name} is included in another product, so it can't include any.`, "included");
  const existing = await deps.db.productInclusion.findUnique({ where: { planId_includedId: { planId: plan.id, includedId: included.id } } });
  if (existing?.quantity === quantity) return;
  const sortOrder = existing?.sortOrder ?? (await deps.db.productInclusion.count({ where: { planId: plan.id } }));
  await deps.db.$transaction(async (tx) => {
    await tx.productInclusion.upsert({
      where: { planId_includedId: { planId: plan.id, includedId: included.id } },
      create: { planId: plan.id, includedId: included.id, quantity, sortOrder },
      update: { quantity },
    });
    await audit(tx, deps.staff, "catalogue.inclusion-set", `${existing ? "Changed" : "Added"} ${included.name} in ${plan.name} (${quantity} for each ${plan.unitLabel.replace(/^per /, "")})`, {
      plan: plan.slug,
      included: included.slug,
      from: existing?.quantity ?? null,
      to: quantity,
    });
  });
}

/** Takes a product out of a plan. Audited. */
export async function removeInclusion(deps: { db: PrismaClient; staff: StaffActor }, planSlug: string, includedSlug: string) {
  assertStaffCan(deps.staff, "manageCatalogue");
  const [plan, included] = await Promise.all([deps.db.product.findUnique({ where: { slug: planSlug } }), deps.db.product.findUnique({ where: { slug: includedSlug } })]);
  if (!plan || !included) throw new DomainError("not-found", "No such product.");
  await deps.db.$transaction(async (tx) => {
    const { count } = await tx.productInclusion.deleteMany({ where: { planId: plan.id, includedId: included.id } });
    if (count) await audit(tx, deps.staff, "catalogue.inclusion-removed", `Took ${included.name} out of ${plan.name}`, { plan: plan.slug, included: included.slug });
  });
}
