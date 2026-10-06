import type { Prisma, User } from "@prisma/client";
import { queueEmail } from "@/server/email/outbox";
import { STAFF_ROLE_LABEL } from "./access";

/**
 * Called when a staff member finishes setting up their authenticator. If
 * they joined from an invitation, the colleague who invited them is
 * emailed once that the account is ready, and it is recorded in the staff
 * audit log. Staff made on the server (`console create-admin`) have no
 * invitation, so nothing is sent.
 */
export async function markStaffReady(tx: Prisma.TransactionClient, user: Pick<User, "id" | "name" | "kind">, now: Date) {
  if (user.kind !== "STAFF") return;
  const claimed = await tx.staffInvitation.updateMany({ where: { userId: user.id, readyAt: null }, data: { readyAt: now } });
  if (claimed.count !== 1) return;
  const inv = await tx.staffInvitation.findUniqueOrThrow({ where: { userId: user.id }, include: { invitedBy: { select: { email: true, deactivatedAt: true } } } });
  if (!inv.invitedBy.deactivatedAt) {
    await queueEmail(tx, { to: inv.invitedBy.email, kind: "staff.ready", payload: { invitationId: inv.id } });
  }
  await tx.staffAuditEvent.create({
    data: {
      actorUserId: user.id,
      actorLabel: user.name,
      action: "staff.ready",
      summary: `${user.name} finished setting up their ${STAFF_ROLE_LABEL[inv.staffRole]} staff account`,
      data: { invitationId: inv.id, userId: user.id },
    },
  });
}
