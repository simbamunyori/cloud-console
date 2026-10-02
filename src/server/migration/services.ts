import type { ConnectorFamily, HostLocation, PrismaClient, ServiceProfile, TaskStatus } from "@prisma/client";
import { formatDay, parseDateOnly } from "@/lib/dates";
import type { BillingAdapter, ServiceStatus } from "@/server/billing/adapter";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";
import { audit } from "@/server/org/audit";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { staffAudit } from "@/server/staff/audit";

/**
 * Services migrated customers already had: their kept ("legacy") prices,
 * and the ones that run with another provider. Billing suspends,
 * unsuspends and cancels those like any other; nothing can reach the
 * other provider, so each change becomes a task for staff, with
 * reminders until it is done. "Move to our servers" ends that.
 */

export const HOST_LABEL: Record<HostLocation, string> = { OURS: "Our servers", CONTABO: "Contabo", SITEGROUND: "SiteGround", OTHER: "Another provider" };

type ProfileDb = { serviceProfile: { findUnique(args: { where: { billingServiceId: string } }): Promise<ServiceProfile | null> } };

/** The price a migrated customer kept for this service, if it has one in this currency. */
export async function legacyPrice(db: ProfileDb, billingServiceId: string, currency: string) {
  const p = await db.serviceProfile.findUnique({ where: { billingServiceId } });
  if (!p || p.legacyRecurringMinor === null || !p.legacyQuantity || p.legacyCurrency !== currency) return null;
  return { recurringMinor: p.legacyRecurringMinor, quantity: p.legacyQuantity, currency: p.legacyCurrency, reviewOn: p.legacyReviewOn };
}

// ─── Hosted elsewhere: billing changes become staff tasks ──────────

export type HostedWork = "suspend" | "unsuspend" | "cancel";
export const HOSTED_TASK: Record<HostedWork, string> = { suspend: "hosted_suspend", unsuspend: "hosted_unsuspend", cancel: "hosted_cancel" };
const HOSTED_KINDS = Object.values(HOSTED_TASK);
/** How soon each must be done: a paying customer waits least. */
const HOURS: Record<HostedWork, number> = { suspend: 4, unsuspend: 2, cancel: 24 };
const OPEN: TaskStatus[] = ["OPEN", "IN_PROGRESS"];
const ENDED: (string | null)[] = ["cancelled", "terminated"];

/** What a status change in billing asks of staff, if anything. */
export function hostedWork(from: string | null, to: ServiceStatus): HostedWork | null {
  if (to === "suspended" && from !== "suspended") return "suspend";
  if (to === "active" && from === "suspended") return "unsuspend";
  if (ENDED.includes(to) && !ENDED.includes(from)) return "cancel";
  return null;
}

function instructions(work: HostedWork, service: { name: string; domain?: string; suspendReason?: string }, profile: { hostedAt: HostLocation; hostServer: string | null; hostNotes: string | null }) {
  const where = HOST_LABEL[profile.hostedAt];
  const what = `${service.name}${service.domain ? ` (${service.domain})` : ""}`;
  const verb = { suspend: "suspend", unsuspend: "unsuspend", cancel: "cancel" }[work];
  const why = {
    suspend: `Billing suspended ${what}${service.suspendReason ? `: ${service.suspendReason}` : ""}.`,
    unsuspend: `Billing brought ${what} back, usually because the customer paid.`,
    cancel: `${what} was cancelled in billing.`,
  }[work];
  return [
    why,
    `It runs at ${where}, not on our servers, so nothing happened there yet.`,
    "",
    `1. Sign in to ${where} and ${verb} it: ${profile.hostServer ?? "the server or account isn't recorded, so check the notes or the customer's records"}.`,
    ...(work === "cancel" ? ["2. Stop paying the provider for it, once anything the customer asked to keep is saved."] : []),
    `${work === "cancel" ? 3 : 2}. Mark this task done.`,
    ...(profile.hostNotes ? ["", `Notes: ${profile.hostNotes}`] : []),
  ].join("\n");
}

/**
 * Compares each service hosted elsewhere with billing and makes one task
 * per change. A suspension still waiting when the service comes back is
 * cancelled instead of asking for an unsuspension.
 */
export async function watchHostedElsewhere(deps: { db: PrismaClient; adapter: BillingAdapter; now?: Date }) {
  const { db, adapter } = deps;
  const now = deps.now ?? new Date();
  const profiles = await db.serviceProfile.findMany({ where: { hostedAt: { not: "OURS" } }, orderBy: { organisationId: "asc" } });
  const byOrg = Map.groupBy(profiles, (p) => p.organisationId);
  let made = 0;
  for (const [organisationId, list] of byOrg) {
    const account = await db.billingAccount.findUnique({ where: { organisationId } });
    if (!account) continue;
    const services = await adapter.listServices(account.externalClientId);
    for (const profile of list) {
      const service = services.find((s) => s.serviceId === profile.billingServiceId);
      if (!service || service.status === profile.lastStatus) continue;
      const work = hostedWork(profile.lastStatus, service.status);
      const family = await familyFor(db, service.productId);
      made += await db.$transaction(async (tx) => {
        // Claimed on the old status, so two runs at once make one task.
        const claimed = await tx.serviceProfile.updateMany({ where: { billingServiceId: profile.billingServiceId, lastStatus: profile.lastStatus }, data: { lastStatus: service.status } });
        if (!claimed.count || !work) return 0;
        if (work === "unsuspend") {
          const waiting = await tx.provisioningTask.findFirst({ where: { billingServiceId: profile.billingServiceId, kind: HOSTED_TASK.suspend, status: { in: OPEN } } });
          if (waiting) {
            await tx.provisioningTask.update({ where: { id: waiting.id }, data: { status: "CANCELLED", notes: "Not needed: billing brought it back before anyone suspended it.", completedAt: now } });
            return 0;
          }
        }
        const verb = { suspend: "Suspend", unsuspend: "Unsuspend", cancel: "Cancel" }[work];
        await tx.provisioningTask.create({
          data: {
            organisationId,
            family,
            kind: HOSTED_TASK[work],
            title: `${verb} ${service.name}${service.domain ? ` (${service.domain})` : ""} at ${HOST_LABEL[profile.hostedAt]}`,
            instructions: instructions(work, service, profile),
            expectedBy: new Date(now.getTime() + HOURS[work] * 3_600_000),
            billingServiceId: profile.billingServiceId,
          },
        });
        return 1;
      });
    }
  }
  return made;
}

async function familyFor(db: PrismaClient, billingProductId: string): Promise<ConnectorFamily> {
  const product = await db.product.findFirst({ where: { billingProductId }, select: { category: { select: { family: { select: { connector: true } } } } } });
  return product?.category.family.connector ?? "SERVICES";
}

/** A late task for a service hosted elsewhere gets a reminder, then one a day until it is done. */
export async function remindLateTasks(deps: { db: PrismaClient; now?: Date }) {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const late = await db.provisioningTask.findMany({
    where: { kind: { in: HOSTED_KINDS }, status: { in: OPEN }, expectedBy: { lt: now }, OR: [{ remindedAt: null }, { remindedAt: { lt: dayAgo } }] },
    include: { assignee: { select: { email: true, deactivatedAt: true } }, organisation: { select: { market: { select: { supportEmail: true } } } } },
  });
  let sent = 0;
  for (const task of late) {
    await db.$transaction(async (tx) => {
      const claimed = await tx.provisioningTask.updateMany({ where: { id: task.id, remindedAt: task.remindedAt }, data: { remindedAt: now } });
      if (!claimed.count) return;
      const to = task.assignee && !task.assignee.deactivatedAt ? task.assignee.email : task.organisation.market.supportEmail;
      await queueEmail(tx, { to, kind: "task.reminder", payload: { taskId: task.id } });
      sent++;
    });
  }
  return sent;
}

// ─── Staff changes ───────────────────────────────────────────────────

export interface HostingDeps {
  db: PrismaClient;
  staff: StaffActor;
  now?: Date;
}

export interface HostingInput {
  hostedAt: string;
  hostServer: string;
  hostNotes: string;
}

const LOCATIONS = Object.keys(HOST_LABEL) as HostLocation[];

/** Records where a service runs. Moving one to our servers is moveToOurServers. */
export async function setHosting(deps: HostingDeps, organisationId: string, service: { serviceId: string; name: string; status: ServiceStatus }, input: HostingInput) {
  assertStaffCan(deps.staff, "manageHosting");
  const hostedAt = input.hostedAt as HostLocation;
  if (!LOCATIONS.includes(hostedAt) || hostedAt === "OURS") throw new DomainError("invalid", "Choose where it runs.", "hostedAt");
  const hostServer = input.hostServer.trim().slice(0, 200) || null;
  if (!hostServer) throw new DomainError("invalid", "Say which server or account it is in, so tasks can say where to go.", "hostServer");
  const hostNotes = input.hostNotes.trim().slice(0, 1000) || null;
  await deps.db.$transaction(async (tx) => {
    const existing = await tx.serviceProfile.findUnique({ where: { billingServiceId: service.serviceId } });
    if (existing && existing.organisationId !== organisationId) throw new DomainError("not-found", "That service isn't on this account.");
    await tx.serviceProfile.upsert({
      where: { billingServiceId: service.serviceId },
      create: { billingServiceId: service.serviceId, organisationId, hostedAt, hostServer, hostNotes, lastStatus: service.status },
      update: { hostedAt, hostServer, hostNotes, ...(existing?.hostedAt === "OURS" ? { lastStatus: service.status } : {}) },
    });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "service.hosting", summary: `Recorded that ${service.name} runs at ${HOST_LABEL[hostedAt]}`, targetType: "Service", targetId: service.serviceId }));
  });
}

/** From now on the service is ours to run: billing changes no longer make tasks. */
export async function moveToOurServers(deps: HostingDeps, organisationId: string, service: { serviceId: string; name: string }) {
  assertStaffCan(deps.staff, "manageHosting");
  const now = deps.now ?? new Date();
  await deps.db.$transaction(async (tx) => {
    const profile = await tx.serviceProfile.findUnique({ where: { billingServiceId: service.serviceId } });
    if (!profile || profile.organisationId !== organisationId) throw new DomainError("not-found", "That service isn't on this account.");
    if (profile.hostedAt === "OURS") throw new DomainError("conflict", "It already runs on our servers.");
    const was = `${HOST_LABEL[profile.hostedAt]}${profile.hostServer ? `, ${profile.hostServer}` : ""}`;
    await tx.serviceProfile.update({
      where: { billingServiceId: service.serviceId },
      data: { hostedAt: "OURS", movedAt: now, movedByName: staffLabel(deps.staff), hostNotes: [profile.hostNotes, `Moved from ${was} on ${formatDay(now, true)}.`].filter(Boolean).join(" ") },
    });
    await audit(tx, staffAudit(deps.staff, organisationId, { action: "service.moved", summary: `Moved ${service.name} to our own servers`, targetType: "Service", targetId: service.serviceId, data: { from: was } }));
  });
}

/** When staff mean to look at a kept price again. Nothing changes on that date by itself. */
export async function setLegacyReview(deps: HostingDeps, organisationId: string, serviceId: string, value: string) {
  assertStaffCan(deps.staff, "managePricing");
  const reviewOn = value.trim() ? parseDateOnly(value.trim()) : null;
  if (value.trim() && !reviewOn) throw new DomainError("invalid", "Enter a date, or leave it empty for none.", "reviewOn");
  const updated = await deps.db.serviceProfile.updateMany({ where: { billingServiceId: serviceId, organisationId, legacyRecurringMinor: { not: null } }, data: { legacyReviewOn: reviewOn } });
  if (!updated.count) throw new DomainError("not-found", "That service has no kept price.");
  await deps.db.staffAuditEvent.create({
    data: { actorUserId: deps.staff.userId, actorLabel: staffLabel(deps.staff), action: "legacy-price.review", summary: reviewOn ? `Set a price review for ${formatDay(reviewOn, true)}` : "Removed a price review date", data: { organisationId, serviceId } },
  });
}

/** Kept prices due for a look, soonest first. */
export async function legacyReviewsDue(db: PrismaClient, today: Date) {
  return db.serviceProfile.findMany({
    where: { legacyRecurringMinor: { not: null }, legacyReviewOn: { lte: today } },
    orderBy: { legacyReviewOn: "asc" },
    include: { organisation: { select: { id: true, name: true } } },
    take: 100,
  });
}
