import type { Incident, IncidentImpact, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";

/**
 * Service status for the site's top strip, footer and status page. Staff
 * post incidents by hand; automatic checks (checkKey "check:…") open and
 * resolve their own. The site never says everything is normal while any
 * incident is open.
 */

export type StatusState = "normal" | "maintenance" | "degraded" | "outage";

export interface ServiceStatus {
  state: StatusState;
  /** "All systems normal", "Some services are slow", … */
  label: string;
  open: Pick<Incident, "id" | "title" | "impact" | "message" | "startedAt">[];
}

const RANK: Record<IncidentImpact, number> = { MAINTENANCE: 1, DEGRADED: 2, OUTAGE: 3 };
const STATE: Record<IncidentImpact, StatusState> = { MAINTENANCE: "maintenance", DEGRADED: "degraded", OUTAGE: "outage" };

export const STATUS_LABEL: Record<StatusState, string> = {
  normal: "All systems normal",
  maintenance: "Planned maintenance under way",
  degraded: "Some services are slow or partly unavailable",
  outage: "Some services are down",
};

export const IMPACT_LABEL: Record<IncidentImpact, string> = { MAINTENANCE: "Maintenance", DEGRADED: "Slow or partly unavailable", OUTAGE: "Down" };

/** The worst open incident decides the state. Pure, for tests. */
export function statusOf(open: Pick<Incident, "impact">[]): StatusState {
  const worst = open.reduce<IncidentImpact | null>((w, i) => (!w || RANK[i.impact] > RANK[w] ? i.impact : w), null);
  return worst ? STATE[worst] : "normal";
}

export async function serviceStatus(db: Pick<PrismaClient, "incident">): Promise<ServiceStatus> {
  const open = await db.incident.findMany({ where: { resolvedAt: null }, orderBy: { startedAt: "desc" }, select: { id: true, title: true, impact: true, message: true, startedAt: true } });
  const state = statusOf(open);
  return { state, label: STATUS_LABEL[state], open };
}

/** Resolved incidents from the last 30 days, newest first, for the status page. */
export function recentIncidents(db: Pick<PrismaClient, "incident">, now = new Date()) {
  return db.incident.findMany({ where: { resolvedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, orderBy: { startedAt: "desc" }, take: 20 });
}

const incidentInput = z.object({
  title: z.string().trim().min(3, "Say what is affected, e.g. Email is slow to arrive.").max(120, "Keep it under 120 characters."),
  impact: z.enum(["DEGRADED", "OUTAGE", "MAINTENANCE"], { message: "Choose how bad it is." }),
  message: z
    .string()
    .trim()
    .max(600, "Keep it under 600 characters.")
    .optional()
    .transform((v) => v || null),
});

type StatusDb = Pick<PrismaClient, "incident" | "staffAuditEvent" | "$transaction">;

export async function openIncident(db: StatusDb, staff: StaffActor, raw: Record<string, unknown>) {
  assertStaffCan(staff, "manageStatus");
  const parsed = incidentInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  }
  return db.$transaction(async (tx) => {
    const incident = await tx.incident.create({ data: { ...parsed.data, openedBy: staff.name } });
    await tx.staffAuditEvent.create({
      data: { actorUserId: staff.userId, actorLabel: staff.name, action: "status.incident-opened", summary: `Posted the incident "${incident.title}" (${IMPACT_LABEL[incident.impact]})`, data: { incidentId: incident.id } },
    });
    return incident;
  });
}

export async function updateIncident(db: StatusDb, staff: StaffActor, id: string, message: string) {
  assertStaffCan(staff, "manageStatus");
  const text = message.trim().slice(0, 600) || null;
  return db.$transaction(async (tx) => {
    const found = await tx.incident.findUnique({ where: { id } });
    if (!found || found.resolvedAt) throw new DomainError("not-found", "That incident is already resolved.");
    await tx.incident.update({ where: { id }, data: { message: text } });
    await tx.staffAuditEvent.create({ data: { actorUserId: staff.userId, actorLabel: staff.name, action: "status.incident-updated", summary: `Updated the incident "${found.title}"`, data: { incidentId: id } } });
  });
}

export async function resolveIncident(db: StatusDb, staff: StaffActor, id: string, now = new Date()) {
  assertStaffCan(staff, "manageStatus");
  return db.$transaction(async (tx) => {
    const updated = await tx.incident.updateMany({ where: { id, resolvedAt: null }, data: { resolvedAt: now, resolvedBy: staff.name } });
    if (!updated.count) throw new DomainError("not-found", "That incident is already resolved.");
    const incident = await tx.incident.findUniqueOrThrow({ where: { id } });
    await tx.staffAuditEvent.create({ data: { actorUserId: staff.userId, actorLabel: staff.name, action: "status.incident-resolved", summary: `Resolved the incident "${incident.title}"`, data: { incidentId: id } } });
  });
}

/** What an automatic check found: healthy, or what is wrong in words for the status page. */
export type CheckResult = { ok: true } | { ok: false; title: string; impact: IncidentImpact; message?: string };

/**
 * Opens the check's incident when it fails and none is open, resolves it
 * when it passes again. Staff can still resolve it by hand.
 */
export async function recordCheck(db: Pick<PrismaClient, "incident">, checkKey: string, result: CheckResult, now = new Date()) {
  const open = await db.incident.findFirst({ where: { checkKey, resolvedAt: null } });
  if (result.ok) {
    if (open) await db.incident.update({ where: { id: open.id }, data: { resolvedAt: now, resolvedBy: "Automatic check" } });
    return;
  }
  if (!open) await db.incident.create({ data: { title: result.title, impact: result.impact, message: result.message ?? null, openedBy: "Automatic check", checkKey, startedAt: now } });
}

/**
 * Billing and ordering: the billing system answers a price lookup. One
 * retry after a short wait, so a single slow reply doesn't post an incident.
 */
export async function checkBilling(db: Pick<PrismaClient, "incident">, probe: () => Promise<unknown>, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  const attempt = () =>
    Promise.race([probe().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 20_000))]).catch(() => false);
  let ok = await attempt();
  if (!ok) {
    await wait(10_000);
    ok = await attempt();
  }
  await recordCheck(
    db,
    "check:billing",
    ok ? { ok: true } : { ok: false, impact: "DEGRADED", title: "Ordering and invoices are unavailable", message: "Your services keep running. New orders, payments and invoices in the console are delayed. We are working on it." },
  );
  return ok;
}
