import type { BackupHealth, Prisma, PrismaClient, RestoreStatus } from "@prisma/client";
import { parseDateOnly as parseDate } from "@/lib/dates";
import type { TenantDb } from "@/server/db";
import { assertCan, DomainError, type Actor } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { featureOn } from "@/server/features/features";
import { backupProviderFrom, partnerConfig } from "@/server/partners/partners";
import { assertStaffCan, staffLabel, type StaffActor } from "@/server/staff/access";
import { BackupProviderError, type BackupProvider } from "./provider";

/**
 * Off-site backup in the console (docs/STRATEGY_ROLLOUT.md, U3). Each
 * backup a customer has, ordered or included in a plan, is a
 * BackupProtection: its status, last successful backup and how long
 * copies are kept, fetched from the provider's API or recorded by our
 * team. Customers ask for restores here. Everything is under our name:
 * nothing a customer reads names the provider.
 */

/** Catalogue products that are off-site backups: ordering one starts a protection. */
export const BACKUP_PRODUCTS: Record<string, string> = {
  "backup-microsoft-365": "Microsoft 365 mailboxes, OneDrive and SharePoint",
  "backup-google-workspace": "Gmail, Drive and shared drives",
  "server-backup": "Server",
};

export const HEALTH_LABEL: Record<BackupHealth, string> = { PENDING: "Being set up", OK: "Healthy", WARNING: "Needs attention", FAILED: "Failed" };
export const RESTORE_LABEL: Record<RestoreStatus, string> = { REQUESTED: "Requested", IN_PROGRESS: "In progress", DONE: "Done", CANCELLED: "Cancelled" };
export const DESTINATIONS = { original: "Back where it was", alongside: "Next to the original, as a copy" } as const;

export const customerBackupOn = (db: Pick<PrismaClient, "featureSwitch">) => featureOn(db, "customer-backup");

/** The provider's adapter while the partner is switched on, else null (our team works by hand). */
export async function activeBackupProvider(db: Pick<PrismaClient, "partnerSetting">): Promise<BackupProvider | null> {
  const config = await partnerConfig(db, "backup-provider");
  if (!config?.enabled) return null;
  return backupProviderFrom(config);
}

type ProtectionTx = { backupProtection: { upsert: (args: Prisma.BackupProtectionUpsertArgs) => Promise<unknown> } };

/** Called in the order's transaction: a backup product, ordered or included, starts a protection. */
export async function startProtection(tx: ProtectionTx, input: { organisationId: string; productSlug: string; productName: string; reference: string }) {
  const label = BACKUP_PRODUCTS[input.productSlug];
  if (!label) return;
  await tx.backupProtection.upsert({
    where: { organisationId_billingServiceId: { organisationId: input.organisationId, billingServiceId: input.reference } },
    create: { organisationId: input.organisationId, billingServiceId: input.reference, label },
    update: {},
  });
}

// ─── Customers ──────────────────────────────────────────────────────

/** What a customer sees: never the provider's reference or our notes. */
export async function customerBackups(db: TenantDb) {
  const [protections, restores] = await Promise.all([
    db.backupProtection.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, health: true, lastSuccessAt: true, lastAttemptAt: true, retentionDays: true, coverage: true, createdAt: true },
    }),
    db.backupRestoreRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, protectionId: true, what: true, fromDay: true, destination: true, status: true, createdAt: true, completedAt: true },
    }),
  ]);
  return { protections, restores };
}

export interface RestoreDeps {
  db: TenantDb;
  actor: Actor;
  organisation: { id: string; name: string };
  provider: BackupProvider | null;
  today: string;
  now?: Date;
}

const RESTORE_HOURS = 8;

/** A customer asks for something back. The provider's API starts it, or our team gets a task. */
export async function requestRestore(deps: RestoreDeps, input: { protectionId: string; what: string; fromDay: string; destination: string }) {
  assertCan(deps.actor, "order");
  const what = input.what.trim();
  const fieldErrors: Record<string, string> = {};
  if (!what) fieldErrors.what = "Say what to restore, e.g. a mailbox, a folder or a file.";
  else if (what.length > 500) fieldErrors.what = "Keep it under 500 characters.";
  const day = parseDate(input.fromDay);
  if (!day) fieldErrors.fromDay = "Enter a date.";
  else if (input.fromDay > deps.today) fieldErrors.fromDay = "Choose today or an earlier day.";
  if (!(input.destination in DESTINATIONS)) fieldErrors.destination = "Choose where it goes back.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  const protection = await deps.db.backupProtection.findFirst({ where: { id: input.protectionId } });
  if (!protection) throw new DomainError("not-found", "That backup isn't on your account.");
  if (protection.health === "PENDING") throw new DomainError("conflict", "This backup is still being set up. You can ask for a restore once its first backup has run.");
  const destination = input.destination as keyof typeof DESTINATIONS;

  // The provider's API first; if it can't take it, our team does it.
  let providerRef: string | null = null;
  let note = "";
  if (deps.provider && protection.providerRef) {
    try {
      providerRef = (await deps.provider.requestRestore({ ref: protection.providerRef, what, fromDay: input.fromDay, destination }))?.ref ?? null;
    } catch (e) {
      note = e instanceof BackupProviderError ? `The provider's API refused it (${e.message}), so do it by hand.` : "The provider's API failed, so do it by hand.";
    }
  }
  const now = deps.now ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const request = await tx.backupRestoreRequest.create({
      data: {
        organisationId: deps.organisation.id,
        protectionId: protection.id,
        what,
        fromDay: day!,
        destination,
        status: providerRef ? "IN_PROGRESS" : "REQUESTED",
        requestedById: deps.actor.userId,
        providerRef,
      },
    });
    if (!providerRef) {
      const task = await tx.provisioningTask.create({
        data: {
          organisationId: deps.organisation.id,
          family: "PROTECTION",
          kind: "restore",
          title: `Restore from backup for ${deps.organisation.name}`,
          instructions: [
            `Backup: ${protection.label}${protection.providerRef ? ` (provider reference ${protection.providerRef})` : ""}.`,
            `What: ${what}`,
            `From: ${input.fromDay}`,
            `Where: ${DESTINATIONS[destination]}`,
            ...(note ? [note] : []),
            "",
            "1. Start the restore in the backup provider's portal.",
            "2. Mark it in progress at /admin/backups, then done once the customer has it back.",
          ].join("\n"),
          expectedBy: new Date(now.getTime() + RESTORE_HOURS * 3_600_000),
        },
      });
      await tx.backupRestoreRequest.update({ where: { id: request.id }, data: { taskId: task.id } });
    }
    await audit(
      tx,
      customerAudit(deps.actor, deps.organisation.id, {
        action: "backup.restore-requested",
        summary: `Asked for a restore from the ${protection.label} backup: ${what.slice(0, 120)} (from ${input.fromDay})`,
        targetType: "BackupRestoreRequest",
        targetId: request.id,
      }),
    );
    return request;
  });
}

// ─── Staff ──────────────────────────────────────────────────────────

export async function staffBackups(db: PrismaClient) {
  const [protections, restores] = await Promise.all([
    db.backupProtection.findMany({ orderBy: [{ health: "desc" }, { createdAt: "asc" }], include: { organisation: { select: { id: true, name: true } } } }),
    db.backupRestoreRequest.findMany({
      where: { status: { in: ["REQUESTED", "IN_PROGRESS"] } },
      orderBy: { createdAt: "asc" },
      include: { organisation: { select: { id: true, name: true } }, protection: { select: { label: true, providerRef: true } } },
    }),
  ]);
  return { protections, restores };
}

const HEALTHS: BackupHealth[] = ["PENDING", "OK", "WARNING", "FAILED"];

/** Our team records a backup's status from the provider's portal (manual mode), or fixes its details. Audited, and in the customer's log. */
export async function updateProtection(
  deps: { db: PrismaClient; staff: StaffActor; now?: Date },
  id: string,
  input: { label: string; health: string; lastSuccessAt: string; retentionDays: string; coverage: string; providerRef: string; notes: string },
) {
  assertStaffCan(deps.staff, "workTasks");
  const fieldErrors: Record<string, string> = {};
  const label = input.label.trim();
  if (!label || label.length > 120) fieldErrors.label = "Enter what is backed up, under 120 characters.";
  if (!HEALTHS.includes(input.health as BackupHealth)) fieldErrors.health = "Choose a status.";
  const last = input.lastSuccessAt.trim() ? parseDate(input.lastSuccessAt.trim()) : null;
  if (input.lastSuccessAt.trim() && !last) fieldErrors.lastSuccessAt = "Enter a date.";
  const retention = input.retentionDays.trim() ? Number(input.retentionDays) : null;
  if (retention !== null && (!Number.isInteger(retention) || retention < 1 || retention > 3650)) fieldErrors.retentionDays = "Enter a number of days from 1 to 3650.";
  if (input.coverage.length > 200) fieldErrors.coverage = "Keep it under 200 characters.";
  if (input.providerRef.length > 200) fieldErrors.providerRef = "Keep it under 200 characters.";
  if (input.notes.length > 2000) fieldErrors.notes = "Keep it under 2000 characters.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  const current = await deps.db.backupProtection.findUnique({ where: { id } });
  if (!current) throw new DomainError("not-found", "No such backup.");
  const health = input.health as BackupHealth;
  await deps.db.$transaction(async (tx) => {
    await tx.backupProtection.update({
      where: { id },
      data: {
        label,
        health,
        lastSuccessAt: last,
        lastAttemptAt: health !== current.health || last?.getTime() !== current.lastSuccessAt?.getTime() ? (deps.now ?? new Date()) : current.lastAttemptAt,
        retentionDays: retention,
        coverage: input.coverage.trim() || null,
        providerRef: input.providerRef.trim() || null,
        notes: input.notes.trim() || null,
        updatedById: deps.staff.userId,
      },
    });
    await audit(tx, {
      organisationId: current.organisationId,
      actorKind: "STAFF",
      actorUserId: deps.staff.userId,
      actorLabel: staffLabel(deps.staff),
      action: "backup.updated",
      summary: `Updated the ${label} backup: ${HEALTH_LABEL[health].toLowerCase()}`,
      targetType: "BackupProtection",
      targetId: id,
    });
  });
}

/** Adds a backup a customer already has (from before the console, or set up by hand). */
export async function addProtection(deps: { db: PrismaClient; staff: StaffActor }, input: { organisationId: string; label: string; reference: string }) {
  assertStaffCan(deps.staff, "workTasks");
  const label = input.label.trim();
  const reference = input.reference.trim() || `manual:${Date.now().toString(36)}`;
  const fieldErrors: Record<string, string> = {};
  if (!label || label.length > 120) fieldErrors.label = "Enter what is backed up, under 120 characters.";
  if (reference.length > 120) fieldErrors.reference = "Keep it under 120 characters.";
  const org = input.organisationId ? await deps.db.organisation.findUnique({ where: { id: input.organisationId }, select: { id: true } }) : null;
  if (!org) fieldErrors.organisationId = "Choose a customer.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  if (await deps.db.backupProtection.findUnique({ where: { organisationId_billingServiceId: { organisationId: org!.id, billingServiceId: reference } } }))
    throw new DomainError("conflict", "That customer already has a backup for that service.", "reference");
  return deps.db.$transaction(async (tx) => {
    const created = await tx.backupProtection.create({ data: { organisationId: org!.id, billingServiceId: reference, label, updatedById: deps.staff.userId } });
    await audit(tx, {
      organisationId: org!.id,
      actorKind: "STAFF",
      actorUserId: deps.staff.userId,
      actorLabel: staffLabel(deps.staff),
      action: "backup.added",
      summary: `Added the ${label} backup`,
      targetType: "BackupProtection",
      targetId: created.id,
    });
    return created;
  });
}

const NEXT: Record<RestoreStatus, RestoreStatus[]> = { REQUESTED: ["IN_PROGRESS", "DONE", "CANCELLED"], IN_PROGRESS: ["DONE", "CANCELLED"], DONE: [], CANCELLED: [] };

/** Moves a restore on. Done or cancelled also closes its task. */
export async function setRestoreStatus(deps: { db: PrismaClient; staff: StaffActor; now?: Date }, id: string, status: string) {
  assertStaffCan(deps.staff, "workTasks");
  const request = await deps.db.backupRestoreRequest.findUnique({ where: { id }, include: { protection: { select: { label: true } } } });
  if (!request) throw new DomainError("not-found", "No such restore.");
  if (!NEXT[request.status].includes(status as RestoreStatus)) throw new DomainError("conflict", `It is already ${RESTORE_LABEL[request.status].toLowerCase()}.`);
  const next = status as RestoreStatus;
  const now = deps.now ?? new Date();
  const closed = next === "DONE" || next === "CANCELLED";
  await deps.db.$transaction(async (tx) => {
    await tx.backupRestoreRequest.update({ where: { id }, data: { status: next, completedAt: closed ? now : null } });
    if (closed && request.taskId)
      await tx.provisioningTask.updateMany({
        where: { id: request.taskId, status: { notIn: ["DONE", "CANCELLED"] } },
        data: next === "DONE" ? { status: "DONE", completedAt: now, completedById: deps.staff.userId } : { status: "CANCELLED" },
      });
    await audit(tx, {
      organisationId: request.organisationId,
      actorKind: "STAFF",
      actorUserId: deps.staff.userId,
      actorLabel: staffLabel(deps.staff),
      action: "backup.restore-updated",
      summary: `Marked the restore from the ${request.protection.label} backup ${RESTORE_LABEL[next].toLowerCase()}`,
      targetType: "BackupRestoreRequest",
      targetId: id,
    });
  });
}

// ─── The hourly sync, API mode only ─────────────────────────────────

/** Fetches status for every backup with a provider reference. Manual mode, or the partner off, does nothing. */
export async function syncBackups(deps: { db: PrismaClient; provider?: BackupProvider | null; now?: Date }) {
  const provider = deps.provider === undefined ? await activeBackupProvider(deps.db) : deps.provider;
  if (!provider || provider.mode !== "api") return { updated: 0, skipped: "manual" as const };
  const protections = await deps.db.backupProtection.findMany({ where: { providerRef: { not: null } }, select: { id: true, providerRef: true } });
  if (!protections.length) return { updated: 0 };
  const byRef = new Map(protections.map((p) => [p.providerRef!, p.id]));
  const statuses = await provider.statuses([...byRef.keys()]);
  for (const s of statuses) {
    const id = byRef.get(s.ref);
    if (!id) continue;
    await deps.db.backupProtection.update({
      where: { id },
      data: { health: s.health, lastSuccessAt: s.lastSuccessAt, lastAttemptAt: s.lastAttemptAt ?? deps.now ?? new Date(), retentionDays: s.retentionDays, coverage: s.coverage },
    });
  }
  return { updated: statuses.length };
}
