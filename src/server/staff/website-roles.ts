import type { PrismaClient, WebsiteRole } from "@prisma/client";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, staffLabel, websiteRoleOf, WEBSITE_ROLE_LABEL, type StaffActor } from "./access";

/** Every active staff member with what they may do in the website editor. */
export async function staffList(db: Pick<PrismaClient, "user">, actor: StaffActor) {
  assertStaffCan(actor, "manageStaff");
  const users = await db.user.findMany({
    where: { kind: "STAFF", deactivatedAt: null },
    select: { id: true, name: true, email: true, staffRole: true, websiteRole: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ ...u, effectiveWebsiteRole: websiteRoleOf(u) }));
}

/** Gives a staff member a website role, or takes it away (null). Recorded in the staff audit log. */
export async function setWebsiteRole(db: Pick<PrismaClient, "$transaction">, actor: StaffActor, userId: string, raw: string) {
  assertStaffCan(actor, "manageStaff");
  const role: WebsiteRole | null = raw === "EDITOR" || raw === "PUBLISHER" ? raw : raw === "" || raw === "NONE" ? null : undefinedRole();
  return db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, kind: "STAFF", deactivatedAt: null } });
    if (!user?.staffRole) throw new DomainError("not-found", "That staff account doesn't exist.");
    if (user.staffRole === "ADMIN") throw new DomainError("invalid", "Admins can always publish, so their website role can't be changed.", "websiteRole");
    if (user.websiteRole === role) return user;
    const updated = await tx.user.update({ where: { id: user.id }, data: { websiteRole: role } });
    await tx.staffAuditEvent.create({
      data: {
        actorUserId: actor.userId,
        actorLabel: staffLabel(actor),
        action: "staff.website-role",
        summary: role ? `Gave ${user.name} the ${WEBSITE_ROLE_LABEL[role]} website role` : `Took ${user.name}'s website role away`,
        data: { userId: user.id, from: user.websiteRole, to: role },
      },
    });
    return updated;
  });
}

function undefinedRole(): never {
  throw new DomainError("invalid", "Choose Editor, Publisher or no website role.", "websiteRole");
}
