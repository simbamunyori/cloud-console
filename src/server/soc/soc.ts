import type { DeviceHealth, IncidentSeverity, IncidentStatus, Prisma, PrismaClient, SecurityProvider, SecurityTenantStatus } from "@prisma/client";
import { parseDateOnly } from "@/lib/dates";
import type { TenantDb } from "@/server/db";
import { queueEmail } from "@/server/email/outbox";
import { featureOn } from "@/server/features/features";
import { captureLead } from "@/server/leads/capture";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { newReference } from "@/server/orders/orders";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { parseDevice, parseIncident, SecurityProviderError, verifyWebhook, type ProviderDevice, type ProviderIncident, type SecurityProviderAdapter } from "./provider";
import { activeProvider, adapterFor, webhookSecretOf } from "./providers";
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, TENANT_STATUS_LABEL } from "./labels";

/**
 * Managed security and the SOC (docs/STRATEGY_ROLLOUT.md, U5): customers'
 * tenants at the security provider, their devices, incidents with
 * severity-based response targets, a timeline, customer emails and
 * escalation, and monthly reports. Everything customers see is under our
 * name. Hidden until Admin > Features > Managed security is on.
 */

/** Catalogue products that are managed security: ordering one starts a tenant. */
export const MANAGED_SECURITY_PRODUCTS = ["managed-detection-response"];

export { HEALTH_LABEL, INCIDENT_STATUS_LABEL, SEVERITY_LABEL, TENANT_STATUS_LABEL } from "./labels";
const SEVERITIES: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES: IncidentStatus[] = ["NEW", "INVESTIGATING", "CONTAINED", "RESOLVED"];
const HEALTHS: DeviceHealth[] = ["HEALTHY", "AT_RISK", "OFFLINE", "UNPROTECTED"];
/** Customers are emailed about incidents of this severity and above as they open. */
const NOTIFY_FROM: IncidentSeverity[] = ["MEDIUM", "HIGH", "CRITICAL"];

export const managedSecurityOn = (db: Pick<PrismaClient, "featureSwitch">) => featureOn(db, "managed-security");

// ─── Response targets ───────────────────────────────────────────────

export const DEFAULT_TARGETS: Record<IncidentSeverity, number> = { CRITICAL: 15, HIGH: 60, MEDIUM: 240, LOW: 1440 };

export async function socSettings(db: Pick<PrismaClient, "socSettings">) {
  const s = await db.socSettings.findUnique({ where: { id: "global" } });
  return {
    targets: { CRITICAL: s?.criticalMinutes ?? DEFAULT_TARGETS.CRITICAL, HIGH: s?.highMinutes ?? DEFAULT_TARGETS.HIGH, MEDIUM: s?.mediumMinutes ?? DEFAULT_TARGETS.MEDIUM, LOW: s?.lowMinutes ?? DEFAULT_TARGETS.LOW } as Record<IncidentSeverity, number>,
    escalationEmail: s?.escalationEmail ?? null,
  };
}

/** Response targets and the escalation address. Admins only, audited. */
export async function saveSocSettings(deps: { db: PrismaClient; staff: StaffActor }, input: Record<"critical" | "high" | "medium" | "low" | "escalationEmail", string>) {
  assertStaffCan(deps.staff, "managePartners");
  const fieldErrors: Record<string, string> = {};
  const minutes = (k: "critical" | "high" | "medium" | "low") => {
    const n = Number(input[k]);
    if (!Number.isInteger(n) || n < 5 || n > 10_080) fieldErrors[k] = "Enter minutes from 5 to 10080.";
    return n;
  };
  const data = { criticalMinutes: minutes("critical"), highMinutes: minutes("high"), mediumMinutes: minutes("medium"), lowMinutes: minutes("low") };
  const email = input.escalationEmail.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fieldErrors.escalationEmail = "Enter an email address.";
  if (!fieldErrors.critical && !fieldErrors.high && data.criticalMinutes > data.highMinutes) fieldErrors.critical = "Critical must be answered no later than high.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  await deps.db.$transaction(async (tx) => {
    const full = { ...data, escalationEmail: email || null, updatedById: deps.staff.userId };
    await tx.socSettings.upsert({ where: { id: "global" }, create: { id: "global", ...full }, update: full });
    await tx.staffAuditEvent.create({ data: { actorUserId: deps.staff.userId, actorLabel: deps.staff.name, action: "soc.settings", summary: `Changed SOC response targets (critical ${data.criticalMinutes}, high ${data.highMinutes}, medium ${data.mediumMinutes}, low ${data.lowMinutes} minutes)`, data: full } });
  });
}

// ─── Tenants ────────────────────────────────────────────────────────

type TenantTx = { securityTenant: { upsert: (args: Prisma.SecurityTenantUpsertArgs) => Promise<unknown> } };

/** Called in the order's transaction: a managed security order starts the customer's tenant with the active provider. */
export async function startTenant(tx: TenantTx, input: { organisationId: string; productSlug: string; providerId: string | null }) {
  if (!MANAGED_SECURITY_PRODUCTS.includes(input.productSlug) || !input.providerId) return;
  await tx.securityTenant.upsert({
    where: { organisationId: input.organisationId },
    create: { organisationId: input.organisationId, providerId: input.providerId },
    update: {},
  });
}

const httpsOrEmpty = (v: string) => !v || /^https:\/\/\S+$/.test(v);

/** Staff record what the provider gave them (manual mode), or correct it. */
export async function saveTenant(deps: { db: PrismaClient; staff: StaffActor }, organisationId: string, input: { tenantRef: string; status: string; enrolmentLink: string; enrolmentNote: string }) {
  assertStaffCan(deps.staff, "workSoc");
  const fieldErrors: Record<string, string> = {};
  if (!["PENDING", "ACTIVE", "SUSPENDED", "REMOVED"].includes(input.status)) fieldErrors.status = "Choose a status.";
  if (!httpsOrEmpty(input.enrolmentLink.trim())) fieldErrors.enrolmentLink = "Enter an address starting with https://.";
  if (input.tenantRef.length > 200) fieldErrors.tenantRef = "That's too long.";
  if (input.enrolmentNote.length > 1000) fieldErrors.enrolmentNote = "Keep it under 1000 characters.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  const provider = await activeProvider(deps.db);
  const current = await deps.db.securityTenant.findUnique({ where: { organisationId } });
  if (!current && !provider) throw new DomainError("conflict", "Make a security provider active in Partners first.");
  const data = { tenantRef: input.tenantRef.trim() || null, status: input.status as SecurityTenantStatus, enrolmentLink: input.enrolmentLink.trim() || null, enrolmentNote: input.enrolmentNote.trim() || null };
  await deps.db.$transaction(async (tx) => {
    await tx.securityTenant.upsert({ where: { organisationId }, create: { organisationId, providerId: provider!.id, ...data }, update: data });
    await tx.auditEvent.create({
      data: { organisationId, actorKind: "STAFF", actorUserId: deps.staff.userId, actorLabel: deps.staff.name, action: "security.tenant-updated", summary: `Updated managed security: ${TENANT_STATUS_LABEL[data.status].toLowerCase()}` },
    });
  });
}

export async function saveDevice(deps: { db: PrismaClient; staff: StaffActor }, organisationId: string, input: { id?: string; name: string; os: string; health: string; lastSeenAt: string }) {
  assertStaffCan(deps.staff, "workSoc");
  const tenant = await deps.db.securityTenant.findUnique({ where: { organisationId } });
  if (!tenant) throw new DomainError("conflict", "Set up the customer's managed security first.");
  const fieldErrors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name || name.length > 200) fieldErrors.name = "Enter the device's name.";
  if (!HEALTHS.includes(input.health as DeviceHealth)) fieldErrors.health = "Choose a status.";
  const seen = input.lastSeenAt.trim() ? parseDateOnly(input.lastSeenAt.trim()) : null;
  if (input.lastSeenAt.trim() && !seen) fieldErrors.lastSeenAt = "Enter a date.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  const data = { name, os: input.os.trim().slice(0, 100) || null, health: input.health as DeviceHealth, lastSeenAt: seen };
  if (input.id) {
    const { count } = await deps.db.securityDevice.updateMany({ where: { id: input.id, organisationId }, data });
    if (!count) throw new DomainError("not-found", "No such device.");
    return;
  }
  await deps.db.securityDevice.create({ data: { organisationId, tenantId: tenant.id, providerRef: `manual:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...data } });
}

export async function removeDevice(deps: { db: PrismaClient; staff: StaffActor }, organisationId: string, id: string) {
  assertStaffCan(deps.staff, "workSoc");
  await deps.db.securityDevice.deleteMany({ where: { id, organisationId } });
}

export async function saveSocReport(deps: { db: PrismaClient; staff: StaffActor }, organisationId: string, input: { month: string; title: string; summary: string; url: string }) {
  assertStaffCan(deps.staff, "workSoc");
  const fieldErrors: Record<string, string> = {};
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) fieldErrors.month = "Enter a month like 2026-10.";
  if (!input.title.trim() || input.title.length > 200) fieldErrors.title = "Enter a title.";
  if (!httpsOrEmpty(input.url.trim())) fieldErrors.url = "Enter an address starting with https://.";
  if (input.summary.length > 4000) fieldErrors.summary = "Keep it under 4000 characters.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  const data = { title: input.title.trim(), summary: input.summary.trim() || null, url: input.url.trim() || null };
  await deps.db.socReport.upsert({ where: { organisationId_month: { organisationId, month: input.month } }, create: { organisationId, month: input.month, ...data }, update: data });
}

// ─── Incidents ──────────────────────────────────────────────────────

type IncidentDb = Pick<PrismaClient, "securityIncident" | "securityIncidentEvent" | "membership" | "outboundEmail" | "socSettings" | "$transaction">;

async function notifyCustomer(tx: Pick<PrismaClient, "membership" | "outboundEmail" | "securityIncidentEvent">, incident: { id: string; organisationId: string }, actorLabel: string) {
  const people = await tx.membership.findMany({ where: { organisationId: incident.organisationId, active: true, role: { in: ["OWNER", "ADMIN"] } }, select: { user: { select: { email: true } } } });
  for (const p of people) await queueEmail(tx, { organisationId: incident.organisationId, to: p.user.email, kind: "soc.incident", payload: { incidentId: incident.id } });
  await tx.securityIncidentEvent.create({ data: { incidentId: incident.id, organisationId: incident.organisationId, kind: "notified", body: `Emailed ${people.length} ${people.length === 1 ? "person" : "people"} at the customer.`, actorLabel } });
}

async function openIncident(
  db: IncidentDb,
  input: { organisationId: string; providerId: string | null; providerRef: string | null; title: string; summary: string; severity: IncidentSeverity; deviceName: string | null },
  actorLabel: string,
  now: Date,
) {
  const { targets } = await socSettings(db);
  return db.$transaction(async (tx) => {
    const incident = await tx.securityIncident.create({ data: { ...input, reference: newReference("SEC"), respondBy: new Date(now.getTime() + targets[input.severity] * 60_000) } });
    await tx.securityIncidentEvent.create({ data: { incidentId: incident.id, organisationId: input.organisationId, kind: "opened", body: `${SEVERITY_LABEL[input.severity]} severity: ${input.title}`, visibleToCustomer: true, actorLabel } });
    if (NOTIFY_FROM.includes(input.severity)) await notifyCustomer(tx, incident, actorLabel);
    return incident;
  });
}

/** An alert from the provider, by webhook or poll. The same one twice is taken once; a resolved one closes ours. */
export async function ingestIncident(db: PrismaClient, provider: Pick<SecurityProvider, "id" | "name">, inc: ProviderIncident, now = new Date()) {
  const tenant = await db.securityTenant.findFirst({ where: { providerId: provider.id, tenantRef: inc.tenantRef } });
  if (!tenant) return { taken: false as const, reason: "unknown tenant" };
  const existing = await db.securityIncident.findUnique({ where: { providerId_providerRef: { providerId: provider.id, providerRef: inc.ref } } });
  if (existing) {
    if (inc.resolved && existing.status !== "RESOLVED") await changeStatus(db, existing.id, "RESOLVED", "Security provider", now, true);
    return { taken: false as const, reason: "already have it", id: existing.id };
  }
  const incident = await openIncident(db, { organisationId: tenant.organisationId, providerId: provider.id, providerRef: inc.ref, title: inc.title, summary: inc.summary, severity: inc.severity, deviceName: inc.deviceName }, "Security operations centre", now);
  return { taken: true as const, id: incident.id };
}

async function changeStatus(db: IncidentDb, id: string, status: IncidentStatus, actorLabel: string, now: Date, notify: boolean) {
  await db.$transaction(async (tx) => {
    const incident = await tx.securityIncident.update({ where: { id }, data: { status, ...(status === "RESOLVED" ? { resolvedAt: now } : { resolvedAt: null }) } });
    await tx.securityIncidentEvent.create({ data: { incidentId: id, organisationId: incident.organisationId, kind: "status", body: `Now ${INCIDENT_STATUS_LABEL[status].toLowerCase()}.`, visibleToCustomer: true, actorLabel } });
    if (notify) await notifyCustomer(tx, incident, actorLabel);
  });
}

/** Staff open an incident by hand (manual mode, or a call from the customer). */
export async function createIncident(deps: { db: PrismaClient; staff: StaffActor; now?: Date }, input: { organisationId: string; title: string; summary: string; severity: string; deviceName: string }) {
  assertStaffCan(deps.staff, "workSoc");
  const fieldErrors: Record<string, string> = {};
  if (!input.title.trim() || input.title.length > 200) fieldErrors.title = "Enter a title under 200 characters.";
  if (!input.summary.trim() || input.summary.length > 4000) fieldErrors.summary = "Say what happened, under 4000 characters.";
  if (!SEVERITIES.includes(input.severity as IncidentSeverity)) fieldErrors.severity = "Choose a severity.";
  const org = input.organisationId ? await deps.db.organisation.findUnique({ where: { id: input.organisationId }, select: { id: true } }) : null;
  if (!org) fieldErrors.organisationId = "Choose a customer.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  const incident = await openIncident(
    deps.db,
    { organisationId: org!.id, providerId: null, providerRef: null, title: input.title.trim(), summary: input.summary.trim(), severity: input.severity as IncidentSeverity, deviceName: input.deviceName.trim() || null },
    deps.staff.name,
    deps.now ?? new Date(),
  );
  // Staff opening it is the first response.
  await deps.db.securityIncident.update({ where: { id: incident.id }, data: { firstResponseAt: deps.now ?? new Date(), assigneeId: deps.staff.userId } });
  return incident;
}

export interface IncidentUpdate {
  status?: string;
  ourAction?: string;
  note?: string;
  assigneeId?: string;
  notify?: boolean;
}

/** Works an incident: status, what we are doing (the customer reads it), internal notes, assignment, and an email to the customer. */
export async function updateIncident(deps: { db: PrismaClient; staff: StaffActor; now?: Date }, id: string, input: IncidentUpdate) {
  assertStaffCan(deps.staff, "workSoc");
  const now = deps.now ?? new Date();
  const incident = await deps.db.securityIncident.findUnique({ where: { id } });
  if (!incident) throw new DomainError("not-found", "No such incident.");
  const fieldErrors: Record<string, string> = {};
  if (input.status && !STATUSES.includes(input.status as IncidentStatus)) fieldErrors.status = "Choose a status.";
  if (input.ourAction !== undefined && input.ourAction.length > 2000) fieldErrors.ourAction = "Keep it under 2000 characters.";
  if (input.note !== undefined && input.note.length > 4000) fieldErrors.note = "Keep it under 4000 characters.";
  let assignee: { id: string; name: string } | null = null;
  if (input.assigneeId) {
    assignee = await deps.db.user.findFirst({ where: { id: input.assigneeId, kind: "STAFF", staffRole: { not: null } }, select: { id: true, name: true } });
    if (!assignee) fieldErrors.assigneeId = "Choose a colleague.";
  }
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);

  const statusChanged = input.status && input.status !== incident.status;
  const action = input.ourAction?.trim();
  const actionChanged = action !== undefined && action !== (incident.ourAction ?? "");
  const note = input.note?.trim();
  const assigned = assignee && assignee.id !== incident.assigneeId;
  if (!statusChanged && !actionChanged && !note && !assigned && !input.notify) return;
  const base = { incidentId: id, organisationId: incident.organisationId, actorLabel: deps.staff.name };
  await deps.db.$transaction(async (tx) => {
    await tx.securityIncident.update({
      where: { id },
      data: {
        ...(statusChanged ? { status: input.status as IncidentStatus, resolvedAt: input.status === "RESOLVED" ? now : null } : {}),
        ...(actionChanged ? { ourAction: action || null } : {}),
        ...(assigned ? { assigneeId: assignee!.id } : {}),
        // Anything staff do on it is the first response.
        ...(incident.firstResponseAt ? {} : { firstResponseAt: now }),
      },
    });
    if (statusChanged) await tx.securityIncidentEvent.create({ data: { ...base, kind: "status", body: `Now ${INCIDENT_STATUS_LABEL[input.status as IncidentStatus].toLowerCase()}.`, visibleToCustomer: true } });
    if (actionChanged && action) await tx.securityIncidentEvent.create({ data: { ...base, kind: "action", body: action, visibleToCustomer: true } });
    if (note) await tx.securityIncidentEvent.create({ data: { ...base, kind: "note", body: note } });
    if (assigned) await tx.securityIncidentEvent.create({ data: { ...base, kind: "assigned", body: `Assigned to ${assignee!.name}.` } });
    if (input.notify) await notifyCustomer(tx, incident, deps.staff.name);
  });
}

/** Raises an incident a level: staff are emailed. By hand, or when its first response is late. */
async function escalateOne(db: PrismaClient, incident: { id: string; organisationId: string; escalationLevel: number }, why: string, actorLabel: string, now: Date) {
  const { escalationEmail } = await socSettings(db);
  await db.$transaction(async (tx) => {
    await tx.securityIncident.update({ where: { id: incident.id }, data: { escalationLevel: incident.escalationLevel + 1, escalatedAt: now } });
    await tx.securityIncidentEvent.create({ data: { incidentId: incident.id, organisationId: incident.organisationId, kind: "escalated", body: `Escalated to level ${incident.escalationLevel + 1}: ${why}`, actorLabel } });
    if (escalationEmail) await queueEmail(tx, { to: escalationEmail, kind: "soc.escalation", payload: { incidentId: incident.id, why } });
  });
}

export async function escalateIncident(deps: { db: PrismaClient; staff: StaffActor; now?: Date }, id: string, why: string) {
  assertStaffCan(deps.staff, "workSoc");
  const incident = await deps.db.securityIncident.findUnique({ where: { id } });
  if (!incident) throw new DomainError("not-found", "No such incident.");
  if (incident.status === "RESOLVED") throw new DomainError("conflict", "It is already resolved.");
  await escalateOne(deps.db, incident, why.trim().slice(0, 500) || "Escalated by hand.", deps.staff.name, deps.now ?? new Date());
}

/** Every 5 minutes: incidents nobody has answered by their target go up a level, and again each target that passes. */
export async function escalateLate(db: PrismaClient, now = new Date()) {
  const { targets } = await socSettings(db);
  const late = await db.securityIncident.findMany({ where: { status: { not: "RESOLVED" }, firstResponseAt: null, respondBy: { lt: now } } });
  let raised = 0;
  for (const i of late) {
    const every = targets[i.severity] * 60_000;
    if (i.escalatedAt && now.getTime() - i.escalatedAt.getTime() < every) continue;
    await escalateOne(db, i, `No response within the ${targets[i.severity]}-minute target for ${SEVERITY_LABEL[i.severity].toLowerCase()} severity.`, "Automatic", now);
    raised++;
  }
  return raised;
}

/** The SOC queue: everything not resolved, most urgent target first. */
export async function socQueue(db: PrismaClient) {
  return db.securityIncident.findMany({
    where: { status: { not: "RESOLVED" } },
    orderBy: [{ respondBy: "asc" }],
    include: { organisation: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
  });
}

// ─── The provider's side: webhooks and polling ───────────────────────

export type WebhookResult = { status: 200 | 202 | 400 | 401 | 404 | 409; message: string };

/**
 * A delivery from the active provider's webhook: signed with the webhook
 * secret over "timestamp.body", no older than 5 minutes, each event id
 * once. Events: "incident" (an alert) and "devices" (a tenant's devices).
 */
export async function receiveWebhook(db: PrismaClient, providerId: string, headers: { signature: string | null; timestamp: string | null }, body: string, now = new Date()): Promise<WebhookResult> {
  const provider = await db.securityProvider.findUnique({ where: { id: providerId } });
  if (!provider || provider.type !== "WEBHOOK" || !provider.active) return { status: 404, message: "Not found." };
  const secret = webhookSecretOf(provider);
  if (!secret) return { status: 401, message: "No webhook secret." };
  const refused = verifyWebhook(secret, headers, body, now);
  if (refused) return { status: 401, message: refused };
  let event: { id?: unknown; type?: unknown; data?: unknown };
  try {
    event = JSON.parse(body);
  } catch {
    return { status: 400, message: "Not JSON." };
  }
  if (typeof event.id !== "string" || !event.id || event.id.length > 200) return { status: 400, message: "No event id." };
  const claimed = await db.securityWebhookEvent.createMany({ data: [{ id: `${providerId}:${event.id}`, providerId }], skipDuplicates: true });
  if (!claimed.count) return { status: 409, message: "Already received." };
  if (event.type === "incident") {
    const inc = parseIncident(event.data);
    if (!inc) return { status: 400, message: "Not an incident." };
    const r = await ingestIncident(db, provider, inc, now);
    return r.taken ? { status: 200, message: "Taken." } : { status: 202, message: r.reason };
  }
  if (event.type === "devices") {
    const d = event.data as { tenant?: unknown; devices?: unknown } | undefined;
    if (typeof d?.tenant !== "string" || !Array.isArray(d.devices)) return { status: 400, message: "Not a device list." };
    const tenant = await db.securityTenant.findFirst({ where: { providerId, tenantRef: d.tenant } });
    if (!tenant) return { status: 202, message: "unknown tenant" };
    const parsed = d.devices.map(parseDevice).filter((x): x is ProviderDevice => x !== null);
    await saveDevices(db, tenant, parsed);
    return { status: 200, message: `${parsed.length} devices.` };
  }
  return { status: 202, message: "Ignored." };
}

async function saveDevices(db: PrismaClient, tenant: { id: string; organisationId: string }, devices: Awaited<ReturnType<SecurityProviderAdapter["devices"]>>) {
  for (const d of devices ?? []) {
    const data = { name: d.name, os: d.os, health: d.health, lastSeenAt: d.lastSeenAt };
    await db.securityDevice.upsert({ where: { tenantId_providerRef: { tenantId: tenant.id, providerRef: d.ref } }, create: { organisationId: tenant.organisationId, tenantId: tenant.id, providerRef: d.ref, ...data }, update: data });
  }
}

/**
 * Every 5 minutes with an API provider: creates tenants for new
 * subscriptions, fetches their installer links and devices, and polls for
 * incidents in case a webhook was missed. Monthly reports on the first
 * days of the month. Manual mode does nothing: staff work it at /admin/soc.
 */
export async function syncSoc(deps: { db: PrismaClient; adapter?: SecurityProviderAdapter; now?: Date }) {
  const now = deps.now ?? new Date();
  const provider = await activeProvider(deps.db);
  if (!provider || provider.type === "MANUAL") return { skipped: "manual" as const };
  const adapter = deps.adapter ?? adapterFor(provider);
  const tenants = await deps.db.securityTenant.findMany({ where: { providerId: provider.id, status: { in: ["PENDING", "ACTIVE"] } }, include: { organisation: { select: { name: true, slug: true } } } });
  let created = 0;
  let failed = 0;
  for (const t of tenants) {
    // One tenant the provider refuses doesn't hold up the others.
    try {
      let ref = t.tenantRef;
      if (!ref) {
        const made = await adapter.createTenant({ organisationName: t.organisation.name, reference: t.organisation.slug });
        if (!made) continue;
        ref = made.tenantRef;
        created++;
      }
      const link = t.enrolmentLink ? null : await adapter.enrolment(ref);
      await deps.db.securityTenant.update({ where: { id: t.id }, data: { tenantRef: ref, status: "ACTIVE", ...(link ? { enrolmentLink: link.link, enrolmentNote: link.note } : {}) } });
      await saveDevices(deps.db, t, await adapter.devices(ref));
      if (now.getUTCDate() <= 3) {
        const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
        if (!(await deps.db.socReport.findUnique({ where: { organisationId_month: { organisationId: t.organisationId, month } } }))) {
          const report = await adapter.report(ref, month);
          if (report) await deps.db.socReport.create({ data: { organisationId: t.organisationId, month, title: report.title, summary: report.summary, url: report.url } });
        }
      }
    } catch (e) {
      if (!(e instanceof SecurityProviderError)) throw e;
      failed++;
    }
  }
  let taken = 0;
  for (const inc of await adapter.incidentsSince(new Date(now.getTime() - 2 * 3_600_000))) if ((await ingestIncident(deps.db, provider, inc, now)).taken) taken++;
  return { created, taken, failed };
}

// ─── Customers ──────────────────────────────────────────────────────

/** Everything the customer sees: never the provider, its references or our internal notes. */
export async function customerSecurity(db: TenantDb) {
  const [tenant, devices, incidents, reports] = await Promise.all([
    db.securityTenant.findFirst({ select: { status: true, enrolmentLink: true, enrolmentNote: true, createdAt: true } }),
    db.securityDevice.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, os: true, health: true, lastSeenAt: true } }),
    db.securityIncident.findMany({
      orderBy: [{ resolvedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      take: 50,
      select: { reference: true, title: true, summary: true, severity: true, status: true, ourAction: true, deviceName: true, createdAt: true, resolvedAt: true },
    }),
    db.socReport.findMany({ orderBy: { month: "desc" }, take: 12, select: { month: true, title: true, summary: true, url: true } }),
  ]);
  return { tenant, devices, incidents, reports };
}

export async function customerIncident(db: TenantDb, reference: string) {
  const incident = await db.securityIncident.findFirst({
    where: { reference },
    select: { id: true, reference: true, title: true, summary: true, severity: true, status: true, ourAction: true, deviceName: true, createdAt: true, resolvedAt: true },
  });
  if (!incident) return null;
  const events = await db.securityIncidentEvent.findMany({ where: { incidentId: incident.id, visibleToCustomer: true }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true, body: true, createdAt: true } });
  return { ...incident, events };
}

/** Before Managed security is on: a customer's interest becomes a pre-sales lead. */
export async function registerInterest(db: PrismaClient, input: { actor: Actor; organisation: { id: string; name: string; billingMarket: string }; email: string; devices: string; note: string }, now = new Date()) {
  assertCan(input.actor, "order");
  const devices = Number(input.devices);
  if (input.devices && (!Number.isInteger(devices) || devices < 1 || devices > 10_000)) throw new DomainError("invalid", "Enter a number of devices.", "devices");
  const need = [`Managed security and the 24/7 SOC, asked for in the console by ${input.organisation.name}.`, input.devices ? `About ${devices} devices.` : "", input.note.trim().slice(0, 1000)].filter(Boolean).join(" ");
  return db.$transaction((tx) =>
    captureLead(
      tx,
      { market: input.organisation.billingMarket, source: "PERSON", tool: "managed-security", name: input.actor.name, email: input.email, company: input.organisation.name, need, consentText: "Asked in the console to be contacted about managed security.", followUps: false },
      now,
    ),
  );
}
