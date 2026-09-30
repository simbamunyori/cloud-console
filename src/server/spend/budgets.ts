import type { Prisma, PrismaClient } from "@prisma/client";
import { addMonths, endOfMonth, startOfMonth, toDateOnly } from "@/lib/dates";
import { divRound, formatMoney, MoneyParseError, parseMoney } from "@/lib/domain/money";
import type { TenantDb } from "@/server/db";
import { queueEmail } from "@/server/email/outbox";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";

/**
 * Monthly budgets for Azure usage, one per subscription, set by the
 * customer. Each night (and after each usage upload) the month so far is
 * checked: a warning goes to owners, admins and billing people when usage
 * is on course to go over, at 80% and at 100%, each once a month.
 */

export type BudgetLevel = "forecast" | "80" | "100";

type Ctx = { organisationId: string; actor: Actor; locale: string };

export async function setBudget(db: TenantDb, ctx: Ctx, subscriptionId: string, amount: string) {
  assertCan(ctx.actor, "pay");
  return db.$transaction(async (tx) => {
    const sub = await tx.cloudSubscription.findFirst({ where: { id: subscriptionId }, include: { organisation: { select: { currency: true } } } });
    if (!sub) throw new DomainError("not-found", "That subscription isn't on your account.");
    let budgetMinor: bigint | null = null;
    if (amount.trim()) {
      try {
        budgetMinor = parseMoney(amount, sub.organisation.currency, ctx.locale);
      } catch (e) {
        if (!(e instanceof MoneyParseError)) throw e;
        throw new DomainError("invalid", "Enter the most you want to spend a month, like 8000.", "budget");
      }
      if (budgetMinor <= 0n) throw new DomainError("invalid", "Enter the most you want to spend a month, or leave it empty for no budget.", "budget");
    }
    const saved = await tx.cloudSubscription.update({ where: { id: sub.id }, data: { budgetMinor } });
    await audit(
      tx,
      customerAudit(ctx.actor, ctx.organisationId, {
        action: budgetMinor === null ? "cloud.budget_removed" : "cloud.budget_set",
        summary: budgetMinor === null ? `Removed the budget for ${sub.name}` : `Set a monthly budget of ${formatMoney({ amountMinor: budgetMinor, currency: sub.organisation.currency }, ctx.locale)} for ${sub.name}`,
        targetType: "CloudSubscription",
        targetId: sub.id,
      }),
    );
    return saved;
  });
}

export interface BudgetStatus {
  usedMinor: bigint;
  forecastMinor: bigint;
  budgetMinor: bigint;
  /** Per cent of the budget used so far, rounded down. */
  usedPercent: number;
  levels: BudgetLevel[];
}

/** Where a month's usage stands against its budget. `lastDay` is the latest day with usage. */
export function budgetStatus(usedMinor: bigint, lastDay: Date | null, budgetMinor: bigint, month: Date): BudgetStatus {
  const days = BigInt(endOfMonth(month).getUTCDate());
  const forecastMinor = lastDay ? divRound(usedMinor * days, BigInt(lastDay.getUTCDate())) : 0n;
  const usedPercent = Number((usedMinor * 100n) / budgetMinor);
  const levels: BudgetLevel[] = [];
  if (usedMinor >= budgetMinor) levels.push("100");
  if (usedMinor * 10n >= budgetMinor * 8n) levels.push("80");
  if (forecastMinor > budgetMinor && usedMinor < budgetMinor) levels.push("forecast");
  return { usedMinor, forecastMinor, budgetMinor, usedPercent, levels };
}

/** Checks every budgeted subscription's month so far and sends each new warning once. */
export async function checkBudgets(db: PrismaClient | Prisma.TransactionClient, today: Date, organisationId?: string): Promise<number> {
  const month = startOfMonth(today);
  const subs = await db.cloudSubscription.findMany({ where: { budgetMinor: { not: null }, ...(organisationId ? { organisationId } : {}) }, include: { organisation: { select: { name: true, currency: true } } } });
  let sent = 0;
  for (const sub of subs) {
    const usage = await db.cloudUsage.aggregate({ where: { subscriptionId: sub.id, day: { gte: month, lt: addMonths(month, 1) }, currency: sub.organisation.currency }, _sum: { priceMinor: true }, _max: { day: true } });
    const status = budgetStatus(usage._sum.priceMinor ?? 0n, usage._max.day, sub.budgetMinor!, month);
    // The highest new level only: at 100% nobody needs the 80% warning too.
    const already = new Set((await db.budgetAlert.findMany({ where: { subscriptionId: sub.id, month } })).map((a) => a.level));
    const next = status.levels.find((l) => !already.has(l));
    if (!next) continue;
    for (const level of status.levels) {
      await db.budgetAlert.upsert({ where: { subscriptionId_month_level: { subscriptionId: sub.id, month, level } }, create: { organisationId: sub.organisationId, subscriptionId: sub.id, month, level }, update: {} });
    }
    const people = await db.membership.findMany({ where: { organisationId: sub.organisationId, active: true, role: { in: ["OWNER", "ADMIN", "BILLING"] } }, include: { user: { select: { email: true } } } });
    for (const p of people) {
      await queueEmail(db, {
        organisationId: sub.organisationId,
        to: p.user.email,
        kind: "spend.budget",
        payload: { subscriptionId: sub.id, month: toDateOnly(month), level: next, used: { amountMinor: String(status.usedMinor), currency: sub.organisation.currency }, forecast: { amountMinor: String(status.forecastMinor), currency: sub.organisation.currency }, budget: { amountMinor: String(sub.budgetMinor), currency: sub.organisation.currency } },
      });
      sent++;
    }
  }
  return sent;
}
