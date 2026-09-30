import type { PrismaClient } from "@prisma/client";
import { addDays, addMonths, formatMonth, startOfMonth, toDateOnly } from "@/lib/dates";
import { money } from "@/lib/domain/money";
import { type BillingAdapter, BillingError, PAYMENT_METHODS } from "@/server/billing/adapter";
import { ensureBillingAccount } from "@/server/billing/accounts";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";
import { audit } from "@/server/org/audit";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";

/**
 * Putting Azure usage on invoices. Once a month has ended and its usage is
 * in, finance reviews what each customer used and raises one invoice per
 * customer, a line per subscription. A subscription's month is billed once;
 * usage uploaded for it afterwards is noted, not billed again.
 */

/** Every Azure usage line starts with this, so spend views count the usage itself instead. */
export const USAGE_LINE_PREFIX = "Azure usage, ";
/** Days a usage invoice gives the customer to pay. */
export const USAGE_TERMS_DAYS = 14;

export const usageLine = (month: Date, subscriptionName: string) => `${USAGE_LINE_PREFIX}${formatMonth(month)} (${subscriptionName})`;

export interface UnbilledCustomer {
  organisationId: string;
  organisationName: string;
  currency: string;
  subscriptions: { id: string; name: string; amountMinor: bigint }[];
  totalMinor: bigint;
}

/** What each customer used in a month that hasn't been billed yet. */
export async function unbilledUsage(db: PrismaClient, month: Date): Promise<UnbilledCustomer[]> {
  const from = startOfMonth(month);
  const sums = await db.cloudUsage.groupBy({
    by: ["subscriptionId", "currency"],
    where: { day: { gte: from, lt: addMonths(from, 1) }, subscription: { bills: { none: { month: from } } } },
    _sum: { priceMinor: true },
  });
  if (!sums.length) return [];
  const subs = await db.cloudSubscription.findMany({ where: { id: { in: sums.map((s) => s.subscriptionId) } }, include: { organisation: { select: { id: true, name: true, currency: true } } } });
  const byOrg = new Map<string, UnbilledCustomer>();
  for (const s of sums) {
    const sub = subs.find((x) => x.id === s.subscriptionId)!;
    if (s.currency !== sub.organisation.currency) continue;
    const c = byOrg.get(sub.organisationId) ?? { organisationId: sub.organisationId, organisationName: sub.organisation.name, currency: sub.organisation.currency, subscriptions: [], totalMinor: 0n };
    const amountMinor = s._sum.priceMinor ?? 0n;
    c.subscriptions.push({ id: sub.id, name: sub.name, amountMinor });
    c.totalMinor += amountMinor;
    byOrg.set(sub.organisationId, c);
  }
  return [...byOrg.values()].sort((a, b) => a.organisationName.localeCompare(b.organisationName));
}

/** Months in the last year, before this one, with usage still to bill, oldest first. */
export async function monthsToBill(db: PrismaClient, today: Date): Promise<Date[]> {
  const days = await db.cloudUsage.findMany({ where: { day: { gte: addMonths(startOfMonth(today), -12), lt: startOfMonth(today) } }, select: { day: true }, distinct: ["day"] });
  const months = [...new Set(days.map((d) => toDateOnly(startOfMonth(d.day))))].sort().map((m) => new Date(`${m}T00:00:00Z`));
  const open: Date[] = [];
  for (const m of months) if ((await unbilledUsage(db, m)).length) open.push(m);
  return open;
}

export interface BillDeps {
  db: PrismaClient;
  adapter: BillingAdapter;
  staff: StaffActor;
  now?: Date;
}

export interface BillResult {
  invoices: { organisationName: string; invoiceId: string; totalMinor: bigint; currency: string }[];
  failed: { organisationName: string; reason: string }[];
}

/**
 * Raises the invoices for a month that has ended. Each subscription's
 * month is claimed before its invoice is raised, so two people pressing
 * the button at once can't bill it twice; a failed invoice gives the
 * claim back.
 */
export async function billUsage(deps: BillDeps, month: Date): Promise<BillResult> {
  assertStaffCan(deps.staff, "billCloudUsage");
  const now = deps.now ?? new Date();
  const from = startOfMonth(month);
  if (addMonths(from, 1) > now) throw new DomainError("invalid", `${formatMonth(from)} hasn't ended yet.`);
  const result: BillResult = { invoices: [], failed: [] };
  for (const c of await unbilledUsage(deps.db, from)) {
    const lines = c.subscriptions.filter((s) => s.amountMinor > 0n);
    if (!lines.length) continue;
    let claimed: string[] = [];
    try {
      claimed = await deps.db.$transaction(
        lines.map((s) => deps.db.cloudUsageBill.create({ data: { organisationId: c.organisationId, subscriptionId: s.id, month: from, amountMinor: s.amountMinor, currency: c.currency, billedById: deps.staff.userId }, select: { id: true } })),
      ).then((rows) => rows.map((r) => r.id));
    } catch {
      result.failed.push({ organisationName: c.organisationName, reason: "Someone else is billing this month." });
      continue;
    }
    try {
      const account = await ensureBillingAccount(deps.db, deps.adapter, c.organisationId);
      const { invoiceId } = await deps.adapter.createInvoice(account.externalClientId, {
        paymentMethod: PAYMENT_METHODS.eft,
        dueOn: addDays(new Date(`${toDateOnly(now)}T00:00:00Z`), USAGE_TERMS_DAYS),
        lines: lines.map((s) => ({ description: usageLine(from, s.name), amount: money(s.amountMinor, c.currency), taxed: true })),
      });
      const total = lines.reduce((n, s) => n + s.amountMinor, 0n);
      await deps.db.$transaction(async (tx) => {
        await tx.cloudUsageBill.updateMany({ where: { id: { in: claimed } }, data: { invoiceId } });
        await audit(tx, staffAudit(deps.staff, c.organisationId, { action: "cloud.usage_billed", summary: `Invoiced Azure usage for ${formatMonth(from)}`, targetType: "Invoice", targetId: invoiceId }));
        const people = await tx.membership.findMany({ where: { organisationId: c.organisationId, active: true, role: { in: ["OWNER", "BILLING"] } }, include: { user: { select: { email: true } } } });
        for (const p of people) await queueEmail(tx, { organisationId: c.organisationId, to: p.user.email, kind: "spend.usage_invoice", payload: { invoiceId, month: toDateOnly(from), amount: { amountMinor: String(total), currency: c.currency } } });
      });
      result.invoices.push({ organisationName: c.organisationName, invoiceId, totalMinor: total, currency: c.currency });
    } catch (e) {
      await deps.db.cloudUsageBill.deleteMany({ where: { id: { in: claimed } } });
      result.failed.push({ organisationName: c.organisationName, reason: e instanceof BillingError || e instanceof DomainError ? e.message : "The billing system didn't answer." });
      if (!(e instanceof BillingError) && !(e instanceof DomainError)) console.error("Azure usage invoice failed:", e);
    }
  }
  return result;
}
