import type { Role } from "@prisma/client";
import type { TenantDb } from "@/server/db";
import { EMAIL_PATTERN, INVITATION_TTL_MS } from "@/server/auth/service";
import { queueEmail } from "@/server/email/outbox";
import { assertCan, canAssignRole, DomainError, ROLE_LABEL, ROLES, type Actor } from "./access";
import { audit, customerAudit } from "./audit";

/** The people in an organisation and invitations to join it. */

export interface InviteInput {
  email: string;
  role: string;
}

function parseRole(role: string): Role {
  if (!ROLES.includes(role as Role)) throw new DomainError("invalid", "Choose what they can do.", "role");
  return role as Role;
}

export async function inviteMember(db: TenantDb, organisationId: string, actor: Actor, input: InviteInput, now = new Date()) {
  assertCan(actor, "manageTeam");
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new DomainError("invalid", "Enter an email address like name@company.co.bw.", "email");
  const role = parseRole(input.role);
  if (!canAssignRole(actor, role)) throw new DomainError("forbidden", "Only an owner can invite another owner.", "role");

  return db.$transaction(async (tx) => {
    const member = await tx.membership.findFirst({ where: { user: { email } }, include: { user: true } });
    if (member?.active) throw new DomainError("conflict", `${member.user.name} is already in your team.`, "email");
    const staff = await tx.user.findFirst({ where: { email, kind: "STAFF" }, select: { id: true } });
    if (staff) throw new DomainError("invalid", "That address belongs to a staff account. Use a different email.", "email");
    const pending = await tx.invitation.findFirst({ where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } });
    if (pending) throw new DomainError("conflict", "This person already has an invitation waiting. Send it again from the list.", "email");
    const invitation = await tx.invitation.create({
      data: {
        organisationId,
        email,
        role,
        invitedById: actor.membershipId,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      },
    });
    await queueEmail(tx, { organisationId, to: email, kind: "invitation", payload: { invitationId: invitation.id } });
    await audit(
      tx,
      customerAudit(actor, organisationId, {
        action: "member.invited",
        summary: `Invited ${email} as ${ROLE_LABEL[role]}`,
        targetType: "Invitation",
        targetId: invitation.id,
      }),
    );
    return invitation;
  });
}

/** Sends a fresh link. The previous one stops working. */
export async function resendInvitation(db: TenantDb, organisationId: string, actor: Actor, invitationId: string, now = new Date()) {
  assertCan(actor, "manageTeam");
  return db.$transaction(async (tx) => {
    const inv = await tx.invitation.findFirst({ where: { id: invitationId } });
    if (!inv || inv.revokedAt || inv.acceptedAt) throw new DomainError("not-found", "That invitation is no longer open.");
    if (!canAssignRole(actor, inv.role)) throw new DomainError("forbidden", "Only an owner can invite another owner.");
    await tx.invitation.update({ where: { id: inv.id }, data: { tokenHash: null, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) } });
    await queueEmail(tx, { organisationId, to: inv.email, kind: "invitation", payload: { invitationId: inv.id } });
    await audit(tx, customerAudit(actor, organisationId, { action: "member.invitation_resent", summary: `Sent the invitation to ${inv.email} again`, targetType: "Invitation", targetId: inv.id }));
  });
}

export async function revokeInvitation(db: TenantDb, organisationId: string, actor: Actor, invitationId: string, now = new Date()) {
  assertCan(actor, "manageTeam");
  return db.$transaction(async (tx) => {
    const inv = await tx.invitation.findFirst({ where: { id: invitationId } });
    if (!inv || inv.revokedAt || inv.acceptedAt) throw new DomainError("not-found", "That invitation is no longer open.");
    if (!canAssignRole(actor, inv.role)) throw new DomainError("forbidden", "Only an owner can withdraw an owner's invitation.");
    await tx.invitation.update({ where: { id: inv.id }, data: { revokedAt: now, tokenHash: null } });
    await audit(tx, customerAudit(actor, organisationId, { action: "member.invitation_revoked", summary: `Withdrew the invitation to ${inv.email}`, targetType: "Invitation", targetId: inv.id }));
  });
}

export interface MemberUpdate {
  role: string;
  active: boolean;
}

/** Changes what someone can do, or removes their access. */
export async function updateMember(db: TenantDb, organisationId: string, actor: Actor, membershipId: string, input: MemberUpdate, now = new Date()) {
  assertCan(actor, "manageTeam");
  const role = parseRole(input.role);
  return db.$transaction(async (tx) => {
    const member = await tx.membership.findFirst({ where: { id: membershipId }, include: { user: true } });
    if (!member) throw new DomainError("not-found", "That person isn't in your team.");
    if (!canAssignRole(actor, member.role) || !canAssignRole(actor, role)) {
      throw new DomainError("forbidden", "Only an owner can change an owner, or make someone an owner.");
    }
    const stillOwner = input.active && role === "OWNER";
    if (member.role === "OWNER" && member.active && !stillOwner) {
      const owners = await tx.membership.count({ where: { role: "OWNER", active: true } });
      if (owners <= 1) throw new DomainError("conflict", "Every organisation needs an owner. Make someone else an owner first.");
    }
    const updated = await tx.membership.update({ where: { id: member.id }, data: { role, active: input.active } });
    if (!input.active) {
      // Their sessions in this organisation end now.
      await tx.session.updateMany({
        where: { userId: member.userId, activeOrganisationId: organisationId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await audit(
      tx,
      customerAudit(actor, organisationId, {
        action: input.active ? "member.updated" : "member.removed",
        summary: input.active
          ? `Changed ${member.user.name} from ${ROLE_LABEL[member.role]} to ${ROLE_LABEL[role]}`
          : `Removed ${member.user.name} from the team`,
        targetType: "Membership",
        targetId: member.id,
        data: { before: { role: member.role, active: member.active }, after: { role, active: input.active } },
      }),
    );
    return updated;
  });
}

export async function teamOverview(db: TenantDb, now = new Date()) {
  const [members, invitations] = await Promise.all([
    db.membership.findMany({
      where: { active: true },
      include: { user: { select: { name: true, email: true, totpEnabled: true, lastLoginAt: true, _count: { select: { passkeys: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invitation.findMany({
      where: { acceptedAt: null, revokedAt: null },
      include: { invitedBy: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      twoStepOn: m.user.totpEnabled || m.user._count.passkeys > 0,
      lastSignIn: m.user.lastLoginAt,
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expired: i.expiresAt.getTime() <= now.getTime(),
      expiresAt: i.expiresAt,
      invitedBy: i.invitedBy.user.name,
    })),
  };
}
