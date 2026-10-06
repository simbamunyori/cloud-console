import type { BusinessUnit, PrismaClient, TicketPriority } from "@prisma/client";
import { featureOn } from "@/server/features/features";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";

/**
 * The business structure in the staff console (docs/STRATEGY_ROLLOUT.md,
 * U7): eight units, each colleague in one or more; every work queue routed
 * to a unit; response targets per unit and priority, measured
 * automatically from tickets and published monthly on the Support pages
 * once there is enough data (behind "Service standards").
 */

export const UNITS: Record<BusinessUnit, { label: string; description: string }> = {
  SALES: { label: "Sales and pre-sales", description: "Leads, pre-sales calls and quotes." },
  DELIVERY: { label: "Service delivery", description: "Setting up what customers order." },
  SUPPORT: { label: "Customer support", description: "Tickets and customers' questions." },
  OPERATIONS: { label: "Operations (NOC and SOC)", description: "Security incidents, backups and restores, the service status." },
  PARTNERSHIPS: { label: "Partnerships and procurement", description: "Partners, their agreements and licence differences." },
  FINANCE: { label: "Finance and billing", description: "Payments, invoices and price approvals." },
  MARKETING: { label: "Marketing", description: "The website, launch kits and the newsletter." },
  PRODUCT: { label: "Product and platform", description: "The catalogue and the console itself." },
};

export const UNIT_KEYS = Object.keys(UNITS) as BusinessUnit[];
export const PRIORITIES: TicketPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];
export const PRIORITY_LABEL: Record<TicketPriority, string> = { URGENT: "Urgent", HIGH: "High", NORMAL: "Normal", LOW: "Low" };

type CountDb = PrismaClient;

export interface QueueDefinition {
  key: string;
  label: string;
  href: string;
  unit: BusinessUnit;
  count: (db: CountDb, now: Date) => Promise<number>;
}

/** Every queue in the staff console and the unit that works it unless an Admin routes it elsewhere. */
export const QUEUES: QueueDefinition[] = [
  { key: "leads", label: "Leads", href: "/admin/leads", unit: "SALES", count: (db) => db.lead.count({ where: { status: "NEW", source: { in: ["PERSON", "ASSISTANT", "BOOKING"] } } }) },
  { key: "bookings", label: "Pre-sales calls", href: "/admin/bookings", unit: "SALES", count: (db, now) => db.presalesBooking.count({ where: { status: "BOOKED", startsAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) } } }) },
  { key: "quotes", label: "Quotes", href: "/admin/quotes", unit: "SALES", count: (db) => db.quote.count({ where: { status: "NEW" } }) },
  { key: "setup-tasks", label: "Setup tasks", href: "/admin/tasks", unit: "DELIVERY", count: (db) => db.provisioningTask.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, kind: { notIn: PARTNER_TASK_KINDS } } }) },
  { key: "tickets", label: "Tickets", href: "/admin/tickets", unit: "SUPPORT", count: (db) => db.ticket.count({ where: { status: "OPEN", deletedAt: null } }) },
  { key: "incidents", label: "Security incidents", href: "/admin/soc", unit: "OPERATIONS", count: (db) => db.securityIncident.count({ where: { status: { not: "RESOLVED" } } }) },
  { key: "restores", label: "Backup restores", href: "/admin/backups", unit: "OPERATIONS", count: (db) => db.backupRestoreRequest.count({ where: { status: "REQUESTED" } }) },
  { key: "partner-tasks", label: "Partner differences and renewals", href: "/admin/partner-register", unit: "PARTNERSHIPS", count: async (db, now) => (await db.provisioningTask.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, kind: { in: PARTNER_TASK_KINDS } } })) + (await renewalsDue(db, now)).length },
  { key: "invoices", label: "EFT payments", href: "/admin/payments", unit: "FINANCE", count: (db) => db.eftPayment.count({ where: { status: "AWAITING_CONFIRMATION" } }) },
  { key: "price-approvals", label: "Price approvals", href: "/admin/pricing", unit: "FINANCE", count: (db) => db.priceBookRun.count({ where: { status: "AWAITING_APPROVAL" } }) },
  { key: "newsletter", label: "Newsletter drafts", href: "/admin/newsletter", unit: "MARKETING", count: (db) => db.newsletterIssue.count({ where: { status: "DRAFT" } }) },
  { key: "launch-kits", label: "Launch kits to publish", href: "/admin/launch-kits", unit: "MARKETING", count: (db) => db.launchKit.count({ where: { draftedAt: { not: null }, pageApprovedAt: null, product: { status: "LIVE" } } }) },
];

/** Setup tasks that are really the partners' business: licence differences and admin access invitations. */
export const PARTNER_TASK_KINDS = ["licence_reconcile", "licence_consent"];

const isQueue = (key: string) => QUEUES.some((q) => q.key === key);

function audit(db: Pick<PrismaClient, "staffAuditEvent">, staff: StaffActor, action: string, summary: string, data: Record<string, unknown>) {
  return db.staffAuditEvent.create({ data: { actorUserId: staff.userId, actorLabel: staff.name, action, summary, data: data as object } });
}

/** Which unit works each queue: the Admin's choice, else the default. */
export async function queueRoutes(db: Pick<PrismaClient, "unitRoute">): Promise<Record<string, BusinessUnit>> {
  const rows = await db.unitRoute.findMany();
  return Object.fromEntries(QUEUES.map((q) => [q.key, rows.find((r) => r.queue === q.key)?.unit ?? q.unit]));
}

export async function routeQueue(deps: { db: PrismaClient; staff: StaffActor }, queue: string, unit: string) {
  assertStaffCan(deps.staff, "manageStaff");
  if (!isQueue(queue)) throw new DomainError("not-found", "No such queue.");
  if (!UNIT_KEYS.includes(unit as BusinessUnit)) throw new DomainError("invalid", "Choose a unit.", "unit");
  await deps.db.$transaction(async (tx) => {
    await tx.unitRoute.upsert({ where: { queue }, create: { queue, unit: unit as BusinessUnit, updatedById: deps.staff.userId }, update: { unit: unit as BusinessUnit, updatedById: deps.staff.userId } });
    await audit(tx, deps.staff, "units.routed", `Routed ${QUEUES.find((q) => q.key === queue)!.label} to ${UNITS[unit as BusinessUnit].label}`, { queue, unit });
  });
}

/** Sets which units a colleague belongs to. */
export async function setStaffUnits(deps: { db: PrismaClient; staff: StaffActor }, userId: string, units: string[]) {
  assertStaffCan(deps.staff, "manageStaff");
  const clean = [...new Set(units)].filter((u): u is BusinessUnit => UNIT_KEYS.includes(u as BusinessUnit));
  if (clean.length !== new Set(units).size) throw new DomainError("invalid", "Choose units from the list.");
  const user = await deps.db.user.findFirst({ where: { id: userId, kind: "STAFF", staffRole: { not: null } }, select: { id: true, name: true } });
  if (!user) throw new DomainError("not-found", "No such colleague.");
  await deps.db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { units: clean } });
    await audit(tx, deps.staff, "units.member", `${user.name} is now in ${clean.length ? clean.map((u) => UNITS[u].label).join(", ") : "no unit"}`, { userId, units: clean });
  });
}

// ─── Response targets ────────────────────────────────────────────────

/** Minutes to the first reply and to resolution, until an Admin sets them per unit. */
export const DEFAULT_TARGETS: Record<TicketPriority, { firstResponse: number; resolve: number }> = {
  URGENT: { firstResponse: 60, resolve: 8 * 60 },
  HIGH: { firstResponse: 4 * 60, resolve: 24 * 60 },
  NORMAL: { firstResponse: 8 * 60, resolve: 3 * 24 * 60 },
  LOW: { firstResponse: 24 * 60, resolve: 5 * 24 * 60 },
};

export type TargetGrid = Record<BusinessUnit, Record<TicketPriority, { firstResponse: number; resolve: number }>>;

export async function unitTargets(db: Pick<PrismaClient, "unitTarget">): Promise<TargetGrid> {
  const rows = await db.unitTarget.findMany();
  return Object.fromEntries(
    UNIT_KEYS.map((u) => [
      u,
      Object.fromEntries(
        PRIORITIES.map((p) => {
          const r = rows.find((x) => x.unit === u && x.priority === p);
          return [p, r ? { firstResponse: r.firstResponseMinutes, resolve: r.resolveMinutes } : DEFAULT_TARGETS[p]];
        }),
      ),
    ]),
  ) as TargetGrid;
}

export async function saveTarget(deps: { db: PrismaClient; staff: StaffActor }, input: { unit: string; priority: string; firstResponse: string; resolve: string }) {
  assertStaffCan(deps.staff, "manageStaff");
  const unit = input.unit as BusinessUnit;
  const priority = input.priority as TicketPriority;
  if (!UNIT_KEYS.includes(unit) || !PRIORITIES.includes(priority)) throw new DomainError("invalid", "Choose a unit and priority.");
  const fieldErrors: Record<string, string> = {};
  const first = Number(input.firstResponse);
  const resolve = Number(input.resolve);
  if (!Number.isInteger(first) || first < 5 || first > 20_160) fieldErrors.firstResponse = "Enter minutes from 5 to 20160.";
  if (!Number.isInteger(resolve) || resolve < 15 || resolve > 86_400) fieldErrors.resolve = "Enter minutes from 15 to 86400.";
  if (!fieldErrors.firstResponse && !fieldErrors.resolve && resolve < first) fieldErrors.resolve = "Resolving can't be due before the first reply.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  await deps.db.$transaction(async (tx) => {
    await tx.unitTarget.upsert({
      where: { unit_priority: { unit, priority } },
      create: { unit, priority, firstResponseMinutes: first, resolveMinutes: resolve, updatedById: deps.staff.userId },
      update: { firstResponseMinutes: first, resolveMinutes: resolve, updatedById: deps.staff.userId },
    });
    await audit(tx, deps.staff, "units.target", `Set ${UNITS[unit].label}, ${PRIORITY_LABEL[priority].toLowerCase()}: first reply ${first} minutes, resolved ${resolve} minutes`, { unit, priority, first, resolve });
  });
}

// ─── Measuring ───────────────────────────────────────────────────────

export interface Measure {
  unit: BusinessUnit;
  priority: TicketPriority;
  tickets: number;
  /** Median minutes. */
  firstResponse: number | null;
  firstWithin: number | null;
  resolve: number | null;
  resolveWithin: number | null;
}

export interface ResponseData {
  month: string;
  measures: Measure[];
  ratings: number;
  /** Average of 1 to 5. */
  satisfaction: number | null;
}

/** Below this many tickets in a month, nothing is published: too few to mean anything. */
export const MIN_PUBLISH = 20;

const minutes = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const share = (xs: number[], limit: number) => (xs.length ? Math.round((xs.filter((x) => x <= limit).length / xs.length) * 100) : null);

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

/** A month's tickets (opened that month) against the targets: medians and the share within target, per unit and priority. */
export async function measureMonth(db: Pick<PrismaClient, "ticket" | "unitTarget">, month: string): Promise<ResponseData> {
  const { from, to } = monthRange(month);
  const [tickets, targets] = await Promise.all([
    db.ticket.findMany({ where: { deletedAt: null, createdAt: { gte: from, lt: to } }, select: { unit: true, priority: true, createdAt: true, firstResponseAt: true, resolvedAt: true } }),
    unitTargets(db),
  ]);
  const rated = await db.ticket.findMany({ where: { deletedAt: null, ratedAt: { gte: from, lt: to }, rating: { not: null } }, select: { rating: true } });
  const measures: Measure[] = [];
  for (const unit of UNIT_KEYS)
    for (const priority of PRIORITIES) {
      const set = tickets.filter((t) => t.unit === unit && t.priority === priority);
      if (!set.length) continue;
      const first = set.filter((t) => t.firstResponseAt).map((t) => minutes(t.createdAt, t.firstResponseAt!));
      const resolve = set.filter((t) => t.resolvedAt).map((t) => minutes(t.createdAt, t.resolvedAt!));
      const target = targets[unit][priority];
      measures.push({ unit, priority, tickets: set.length, firstResponse: median(first), firstWithin: share(first, target.firstResponse), resolve: median(resolve), resolveWithin: share(resolve, target.resolve) });
    }
  const scores = rated.map((r) => r.rating!);
  return { month, measures, ratings: scores.length, satisfaction: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null };
}

export const previousMonthOf = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);

/** On the 2nd of each month: last month's measures, published when there were enough tickets. */
export async function writeResponseReport(db: PrismaClient, now = new Date()) {
  const month = previousMonthOf(now);
  const data = await measureMonth(db, month);
  const tickets = data.measures.reduce((n, m) => n + m.tickets, 0);
  const published = tickets >= MIN_PUBLISH;
  await db.responseReport.upsert({ where: { month }, create: { month, data: data as object, tickets, published }, update: { data: data as object, tickets, published } });
  return { month, tickets, published };
}

/** What the Support pages show: the latest published month, only while "Service standards" is on. */
export async function publishedResponseTimes(db: Pick<PrismaClient, "featureSwitch" | "responseReport">) {
  if (!(await featureOn(db, "service-standards"))) return null;
  const report = await db.responseReport.findFirst({ where: { published: true }, orderBy: { month: "desc" } });
  if (!report) return null;
  const data = report.data as unknown as ResponseData;
  // Customers see support as a whole: every unit's tickets together, by priority.
  const byPriority = PRIORITIES.map((p) => {
    const rows = data.measures.filter((m) => m.priority === p);
    const tickets = rows.reduce((n, m) => n + m.tickets, 0);
    const weighted = (pick: (m: Measure) => number | null) => {
      const usable = rows.filter((m) => pick(m) !== null);
      const n = usable.reduce((s, m) => s + m.tickets, 0);
      return n ? Math.round(usable.reduce((s, m) => s + pick(m)! * m.tickets, 0) / n) : null;
    };
    return { priority: p, tickets, firstResponse: weighted((m) => m.firstResponse), firstWithin: weighted((m) => m.firstWithin) };
  }).filter((r) => r.tickets > 0);
  return { month: report.month, tickets: report.tickets, byPriority, satisfaction: data.satisfaction, ratings: data.ratings };
}

/** "3 hours", "45 minutes", "2 days". */
export function duration(mins: number): string {
  if (mins < 60) return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(mins / 1440);
  return `${days} days`;
}

// ─── My work ─────────────────────────────────────────────────────────

/** The queues routed to a colleague's units, with what is waiting in each. */
export async function myQueues(db: PrismaClient, userId: string, now = new Date()) {
  const [user, routes] = await Promise.all([db.user.findUnique({ where: { id: userId }, select: { units: true } }), queueRoutes(db)]);
  const units = user?.units ?? [];
  const mine = QUEUES.filter((q) => units.includes(routes[q.key]));
  return { units, queues: await Promise.all(mine.map(async (q) => ({ key: q.key, label: q.label, href: q.href, unit: routes[q.key], waiting: await q.count(db, now) }))) };
}

// ─── Partner renewals (the register lives in partner-register.ts) ───

/** Agreements whose notice period starts within two weeks, not yet past their renewal date. */
export async function renewalsDue(db: Pick<PrismaClient, "partnerRecord">, now: Date) {
  const records = await db.partnerRecord.findMany({ where: { status: { in: ["ACTIVE", "PAUSED"] }, renewsOn: { gte: new Date(now.getTime() - 86_400_000) } }, orderBy: { renewsOn: "asc" } });
  return records.filter((r) => r.renewsOn && r.renewsOn.getTime() - (r.noticeDays + 14) * 86_400_000 <= now.getTime());
}
