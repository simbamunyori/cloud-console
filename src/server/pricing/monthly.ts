import { Prisma, type PriceBookRun, type PrismaClient } from "@prisma/client";
import { company, DEFAULT_TIME_ZONE } from "@/config/app";
import { daysBetween, formatLongDate, formatMonth, todayIn, toDateOnly } from "@/lib/dates";
import { divCeil, formatMoney } from "@/lib/domain/money";
import { monthOf } from "@/lib/domain/pricing";
import { bookRows } from "@/server/catalogue/price-book";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { bpsText, emailAdmins, sendAlert } from "./alerts";
import { latestTable, microsText, neededPairs, rateMicros, type TableWithRates } from "./official-rates";

/**
 * The monthly price book, built on the 1st at 06:00 (boss.ts):
 *
 * 1. The month's rates come from the newest Bank of Botswana table in
 *    use, and replace any rate already set for the month.
 * 2. Every market that is switched on gets a suggestion for each priced
 *    item (cost, the new rate, the buffer and the margin, as always).
 * 3. If no price moves by more than the threshold (PricingSettings,
 *    3% unless an Admin changes it), the new prices apply at once, are
 *    sent to WHMCS, and the staff audit log says it was automatic.
 *    Otherwise Admins get an email with a link to approve them, and the
 *    previous prices stay until someone does.
 *
 * Prices then stay fixed for the month. A price staff approved by hand
 * for the month is theirs and is left alone. Items with no price yet are
 * left for staff to price.
 */

/** A table older than this on the 1st isn't "the latest official rates"; we wait and alert instead. */
export const MAX_TABLE_AGE_DAYS = 7;
export const SYSTEM_ACTOR = { actorUserId: "system", actorLabel: "Automatic pricing" };

export interface PriceChange {
  market: string;
  item: string;
  name: string;
  currency: string;
  /** Minor units, as text. */
  from: string;
  to: string;
  fromRenew?: string | null;
  toRenew?: string | null;
  changeBps: number;
  breakdown: unknown;
}

export interface RunRate {
  base: string;
  quote: string;
  rateMicros: string;
}

/** Who sends the prices to WHMCS: the Admin who approved them, or the system. */
export type SyncActor = { staff: StaffActor } | { system: string };

export interface MonthlyDeps {
  db: PrismaClient;
  now?: () => Date;
  /** Sends the price books in effect to billing. Unset when billing reads them directly (the stub). */
  sync?: (actor: SyncActor) => Promise<void>;
}

const monthLabel = (m: string) => formatMonth(new Date(`${m}-01T00:00:00Z`));

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** How far a price moves, in basis points, rounded up. From nothing counts as 100%. */
function changeBps(from: bigint, to: bigint): number {
  if (from === to) return 0;
  if (from <= 0n) return 10_000;
  const diff = to > from ? to - from : from - to;
  return Number(divCeil(diff * 10_000n, from));
}

export const runChanges = (run: Pick<PriceBookRun, "changes">) => run.changes as unknown as PriceChange[];
export const runRates = (run: Pick<PriceBookRun, "rates">) => run.rates as unknown as RunRate[];

/** One change in words, e.g. "Microsoft 365 Business Basic (bw): P 120.00 to P 125.00, 4.2%". */
export function describePriceChange(c: PriceChange): string {
  const show = (v: string) => formatMoney({ amountMinor: BigInt(v), currency: c.currency }, company.staffLocale);
  const renew = c.toRenew && c.fromRenew !== c.toRenew ? `, renews ${c.fromRenew ? show(c.fromRenew) : "none"} to ${show(c.toRenew)}` : "";
  return `${c.name} (${c.market}): ${show(c.from)} to ${show(c.to)}${renew}, ${bpsText(c.changeBps)}%`;
}

/** Works out the month's rates and every price that would change. Writes the rates, nothing else. */
async function planMonth(db: PrismaClient, month: string, table: TableWithRates) {
  const pairs = await neededPairs(db);
  const rates: RunRate[] = [];
  for (const p of pairs) {
    const micros = rateMicros(table.rates, p.base, p.quote);
    if (micros === null) return { problem: `The table published ${toDateOnly(table.publishedOn)} has no rate for ${p.base} to ${p.quote}.` } as const;
    rates.push({ ...p, rateMicros: micros.toString() });
  }
  for (const r of rates) {
    const data = { rateMicros: BigInt(r.rateMicros), source: "bob", sourceDate: table.publishedOn, setById: null };
    await db.fxRate.upsert({ where: { month_base_quote: { month, base: r.base, quote: r.quote } }, update: data, create: { month, base: r.base, quote: r.quote, ...data } });
  }

  const changes: PriceChange[] = [];
  const markets = await db.market.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } });
  for (const market of markets) {
    // Seen from last month, a priced row's next approval applies from this month.
    const { rows } = await bookRows(db, market.code, previousMonth(month));
    const byHand = new Set((await db.priceBookEntry.findMany({ where: { marketCode: market.code, month, approvedById: { not: null } }, select: { item: true } })).map((e) => e.item));
    for (const r of rows) {
      if (!r.offered || !r.suggestion || !r.current || r.targetMonth !== month || byHand.has(r.item)) continue;
      const to = r.suggestion.price.amountMinor;
      const toRenew = r.kind === "tld" ? (r.suggestion.renew?.amountMinor ?? null) : null;
      const fromRenew = r.kind === "tld" ? (r.currentRenew?.amountMinor ?? null) : null;
      if (to === r.current.amountMinor && toRenew === fromRenew) continue;
      changes.push({
        market: market.code,
        item: r.item,
        name: r.name,
        currency: market.currency,
        from: r.current.amountMinor.toString(),
        to: to.toString(),
        fromRenew: fromRenew?.toString() ?? null,
        toRenew: toRenew?.toString() ?? null,
        changeBps: Math.max(changeBps(r.current.amountMinor, to), toRenew !== null ? changeBps(fromRenew ?? 0n, toRenew) : 0),
        breakdown: r.suggestion.breakdown,
      });
    }
  }
  return { rates, changes } as const;
}

/** Writes a run's prices into the price books for its month. */
async function writeEntries(tx: Prisma.TransactionClient, run: PriceBookRun, approvedById: string | null, now: Date) {
  for (const c of runChanges(run)) {
    const data = {
      currency: c.currency,
      amountMinor: BigInt(c.to),
      renewMinor: c.toRenew ? BigInt(c.toRenew) : null,
      suggestedMinor: BigInt(c.to),
      breakdown: (c.breakdown ?? Prisma.DbNull) as Prisma.InputJsonValue,
      approvedById,
      approvedAt: now,
      runId: run.id,
    };
    await tx.priceBookEntry.upsert({
      where: { marketCode_item_month: { marketCode: c.market, item: c.item, month: run.month } },
      update: data,
      create: { marketCode: c.market, item: c.item, month: run.month, ...data },
    });
  }
}

const ratesText = (rates: RunRate[]) => rates.map((r) => `1 ${r.base} = ${microsText(BigInt(r.rateMicros))} ${r.quote}`).join(", ");

/**
 * Builds this month's price book, once. Safe to call again: a month that
 * already has one is left alone. Returns null, with an email to Admins,
 * when there are no recent official rates to build it from.
 */
export async function buildMonth(deps: MonthlyDeps): Promise<PriceBookRun | null> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const today = todayIn(DEFAULT_TIME_ZONE, now);
  const month = monthOf(today);
  const existing = await db.priceBookRun.findUnique({ where: { month } });
  if (existing) return existing;

  const table = await latestTable(db, today);
  const wait = (why: string) =>
    sendAlert(db, `build-waiting:${month}:${toDateOnly(today)}`, {
      subject: `${monthLabel(month)} prices are waiting for exchange rates`,
      heading: `${monthLabel(month)} prices aren't set yet`,
      paragraphs: [why, `Last month's prices stay in effect. We try again each time the rates are checked, and build the price book as soon as there's a recent table.`],
    }).then(() => null);
  if (!table) return wait("There's no Bank of Botswana rate table in use yet.");
  if (daysBetween(table.publishedOn, today) > MAX_TABLE_AGE_DAYS) return wait(`The newest Bank of Botswana table in use was published ${formatLongDate(table.publishedOn)}, which is too old to price a month from.`);

  const plan = await planMonth(db, month, table);
  if ("problem" in plan) return wait(plan.problem!);
  const { rates, changes } = plan;
  const settings = await db.pricingSettings.findUnique({ where: { id: "global" } });
  const thresholdBps = settings?.autoApproveBps ?? 300;
  const maxChangeBps = Math.max(0, ...changes.map((c) => c.changeBps));
  const status = changes.length === 0 ? "NO_CHANGES" : maxChangeBps <= thresholdBps ? "APPLIED" : "AWAITING_APPROVAL";
  const source = `Bank of Botswana, published ${formatLongDate(table.publishedOn)}`;
  const label = monthLabel(month);

  let run: PriceBookRun;
  try {
    run = await db.$transaction(async (tx) => {
      const created = await tx.priceBookRun.create({
        data: {
          month,
          status,
          tableId: table.id,
          rates: rates as unknown as Prisma.InputJsonValue,
          changes: changes as unknown as Prisma.InputJsonValue,
          maxChangeBps,
          thresholdBps,
          approvedAt: status === "APPLIED" ? now : null,
        },
      });
      const data = { month, publishedOn: toDateOnly(table.publishedOn), rates, changes, maxChangeBps, thresholdBps } as unknown as Prisma.InputJsonValue;
      if (status === "APPLIED") {
        await writeEntries(tx, created, null, now);
        await tx.staffAuditEvent.create({
          data: {
            ...SYSTEM_ACTOR,
            action: "pricing.auto-approved",
            summary: `Approved ${changes.length} ${changes.length === 1 ? "price" : "prices"} for ${label} automatically: the largest change is ${bpsText(maxChangeBps)}%, within the ${bpsText(thresholdBps)}% threshold. Rates from ${source}: ${ratesText(rates)}`,
            data,
          },
        });
      } else if (status === "NO_CHANGES") {
        await tx.staffAuditEvent.create({
          data: { ...SYSTEM_ACTOR, action: "pricing.month-rates", summary: `Set ${label} rates from ${source} (${ratesText(rates)}). No price changes.`, data },
        });
      } else {
        await tx.staffAuditEvent.create({
          data: {
            ...SYSTEM_ACTOR,
            action: "pricing.approval-requested",
            summary: `${label} price book needs approval: the largest change is ${bpsText(maxChangeBps)}%, over the ${bpsText(thresholdBps)}% threshold. Rates from ${source}: ${ratesText(rates)}`,
            data,
          },
        });
        await emailAdmins(tx, "pricing.approval_needed", { month });
      }
      return created;
    });
  } catch (e) {
    // Another worker built it first.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return db.priceBookRun.findUnique({ where: { month } });
    throw e;
  }
  if (status === "APPLIED") return syncRun(deps, run, { system: SYSTEM_ACTOR.actorLabel });
  return run;
}

/** Sends a run's prices to WHMCS and records how it went. A failure emails Admins; the rates job tries again. */
export async function syncRun(deps: MonthlyDeps, run: PriceBookRun, actor: SyncActor): Promise<PriceBookRun> {
  const now = deps.now?.() ?? new Date();
  if (!deps.sync) return deps.db.priceBookRun.update({ where: { id: run.id }, data: { syncedAt: now, syncError: null } });
  try {
    await deps.sync(actor);
    return await deps.db.priceBookRun.update({ where: { id: run.id }, data: { syncedAt: now, syncError: null } });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : "Unknown error";
    const updated = await deps.db.priceBookRun.update({ where: { id: run.id }, data: { syncError: message } });
    await sendAlert(deps.db, `sync-failed:${run.month}:${toDateOnly(todayIn(DEFAULT_TIME_ZONE, now))}`, {
      subject: `${monthLabel(run.month)} prices didn't reach WHMCS`,
      heading: "WHMCS still has last month's prices",
      paragraphs: [`The console's price books have the new prices, but sending them to WHMCS failed: ${message}`, `We try again each time the rates are checked. You can also run the price sync by hand (docs/whmcs-setup.md, section 6).`],
    });
    return updated;
  }
}

/** Retries the WHMCS sync for this month's applied price book, if it hasn't gone through. */
export async function retrySync(deps: MonthlyDeps) {
  const month = monthOf(todayIn(DEFAULT_TIME_ZONE, deps.now?.() ?? new Date()));
  const run = await deps.db.priceBookRun.findUnique({ where: { month } });
  if (!run || run.status !== "APPLIED" || run.syncedAt) return run;
  return syncRun(deps, run, run.approvedById && run.approvedByName ? { staff: { userId: run.approvedById, name: run.approvedByName, staffRole: "ADMIN" } } : { system: SYSTEM_ACTOR.actorLabel });
}

/**
 * An Admin approves a month's price book that was over the threshold.
 * The prices apply at once and go to WHMCS. Logged. Approving twice does
 * nothing the second time.
 */
export async function approveRun(deps: MonthlyDeps & { staff: StaffActor }, month: string): Promise<PriceBookRun> {
  assertStaffCan(deps.staff, "managePricing");
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const run = await db.priceBookRun.findUnique({ where: { month } });
  if (!run) throw new DomainError("not-found", "There's no price book for that month.");
  if (run.status !== "AWAITING_APPROVAL") return run;
  const current = monthOf(todayIn(DEFAULT_TIME_ZONE, now));
  if (run.month !== current) throw new DomainError("invalid", `This price book was for ${monthLabel(run.month)}, which has ended. ${monthLabel(current)} has its own.`);

  const changes = runChanges(run);
  const approved = await db.$transaction(async (tx) => {
    const claim = await tx.priceBookRun.updateMany({
      where: { id: run.id, status: "AWAITING_APPROVAL" },
      data: { status: "APPLIED", approvedById: deps.staff.userId, approvedByName: staffLabel(deps.staff), approvedAt: now },
    });
    if (claim.count !== 1) return null;
    const updated = await tx.priceBookRun.findUniqueOrThrow({ where: { id: run.id } });
    await writeEntries(tx, updated, deps.staff.userId, now);
    for (const c of changes) {
      await tx.pricingChange.create({ data: { userId: deps.staff.userId, field: `price:${c.market}:${c.item}:${run.month}`, fromValue: c.from, toValue: c.to } });
    }
    await tx.staffAuditEvent.create({
      data: {
        actorUserId: deps.staff.userId,
        actorLabel: staffLabel(deps.staff),
        action: "pricing.month-approved",
        summary: `Approved ${changes.length} ${changes.length === 1 ? "price" : "prices"} for ${monthLabel(run.month)}: the largest change is ${bpsText(run.maxChangeBps)}%, over the ${bpsText(run.thresholdBps)}% threshold`,
        data: { month: run.month, changes } as unknown as Prisma.InputJsonValue,
      },
    });
    return updated;
  });
  if (!approved) return db.priceBookRun.findUniqueOrThrow({ where: { id: run.id } });
  return syncRun(deps, approved, { staff: deps.staff });
}

/** For the Pricing page: the last few months' price books, newest first. */
export function recentRuns(db: Pick<PrismaClient, "priceBookRun">, take = 12) {
  return db.priceBookRun.findMany({ orderBy: { month: "desc" }, take, include: { table: { select: { publishedOn: true } } } });
}
