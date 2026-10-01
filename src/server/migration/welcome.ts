import type { PrismaClient } from "@prisma/client";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatDay, hourIn, parseDateOnly, todayIn } from "@/lib/dates";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, staffLabel } from "@/server/staff/access";
import type { MigrationDeps } from "./run";

/**
 * Welcome emails for migrated customers. Nothing is sent when the import
 * runs: an admin chooses the cutover date, and on that day from 08:00
 * Gaborone time every person brought over gets one email. Someone with no
 * way to sign in yet gets a link to choose a password, valid 14 days.
 */

export const WELCOME_HOUR = 8;
export const WELCOME_LINK_DAYS = 14;

/** Sets or changes the cutover date, or clears it with an empty value. Only before the emails go. */
export async function setCutover(deps: MigrationDeps, batchId: string, value: string) {
  assertStaffCan(deps.staff, "migrateClients");
  const batch = await deps.db.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.status !== "IMPORTED") throw new DomainError("conflict", "Choose the cutover date once the import has finished.");
  if (batch.welcomeSentAt) throw new DomainError("conflict", "The welcome emails have already gone.");
  const cutoverOn = value.trim() ? parseDateOnly(value.trim()) : null;
  if (value.trim() && !cutoverOn) throw new DomainError("invalid", "Enter a date.", "cutoverOn");
  const today = todayIn(DEFAULT_TIME_ZONE, deps.now);
  if (cutoverOn && cutoverOn < today) throw new DomainError("invalid", "Choose today or a later day.", "cutoverOn");
  await deps.db.$transaction(async (tx) => {
    await tx.migrationBatch.update({ where: { id: batch.id }, data: { cutoverOn, cutoverSetByName: cutoverOn ? staffLabel(deps.staff) : null } });
    await tx.staffAuditEvent.create({
      data: {
        actorUserId: deps.staff.userId,
        actorLabel: staffLabel(deps.staff),
        action: "migration.cutover",
        summary: cutoverOn ? `Set the cutover for ${formatDay(cutoverOn, true)}: welcome emails go out that morning` : "Cleared the cutover date: no welcome emails until one is chosen",
        data: { batchId },
      },
    });
  });
}

/** Sends the welcome emails of every import whose cutover has come. Safe to run twice. */
export async function sendWelcomes(deps: { db: PrismaClient; now?: Date }) {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const today = todayIn(DEFAULT_TIME_ZONE, now);
  const batches = await db.migrationBatch.findMany({ where: { status: "IMPORTED", welcomeSentAt: null, cutoverOn: { lte: today } } });
  let queued = 0;
  for (const batch of batches) {
    if (batch.cutoverOn!.getTime() === today.getTime() && hourIn(DEFAULT_TIME_ZONE, now) < WELCOME_HOUR) continue;
    const claimed = await db.migrationBatch.updateMany({ where: { id: batch.id, welcomeSentAt: null }, data: { welcomeSentAt: now } });
    if (!claimed.count) continue;
    const people = await db.migrationRecord.findMany({ where: { batchId: batch.id, kind: "person", welcomedAt: null, targetId: { not: null } } });
    for (const person of people) {
      queued += await db.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: person.targetId! }, include: { _count: { select: { identities: true, passkeys: true } } } });
        await tx.migrationRecord.update({ where: { id: person.id }, data: { welcomedAt: now } });
        if (!user || user.deactivatedAt || user.kind !== "CUSTOMER") return 0;
        const canSignIn = !!user.passwordHash || user._count.identities > 0 || user._count.passkeys > 0;
        const reset = canSignIn ? null : await tx.passwordReset.create({ data: { userId: user.id, expiresAt: new Date(now.getTime() + WELCOME_LINK_DAYS * 86_400_000), createdAt: now } });
        await queueEmail(tx, { organisationId: person.organisationId ?? undefined, to: user.email, kind: "migration.welcome", payload: { organisationId: person.organisationId, resetId: reset?.id ?? null } });
        return 1;
      });
    }
  }
  return queued;
}
