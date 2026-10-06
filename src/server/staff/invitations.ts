import type { Prisma, PrismaClient, StaffRole, WebsiteRole } from "@prisma/client";
import { hashPassword, passwordStrength } from "@/server/auth/password";
import { AuthError, clock, createSession, EMAIL_PATTERN, INVITATION_TTL_MS, type AuthDeps, type RequestContext } from "@/server/auth/service";
import { hashToken } from "@/server/auth/tokens";
import { queueEmail } from "@/server/email/outbox";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, STAFF_ROLE_LABEL, STAFF_ROLES, staffLabel, WEBSITE_ROLE_LABEL, type StaffActor } from "./access";

/**
 * Inviting colleagues to the staff console. An Admin sends an invitation;
 * the colleague opens the emailed link, chooses their name and password,
 * then sets up their authenticator app. When that is done the person who
 * invited them gets an email (markStaffReady). Everything is recorded in
 * the staff audit log.
 */

type Db = Pick<PrismaClient, "$transaction" | "staffInvitation" | "user">;

export interface StaffInviteInput {
  email: string;
  staffRole: string;
  websiteRole?: string;
}

function parseStaffRole(raw: string): StaffRole {
  if (!STAFF_ROLES.includes(raw as StaffRole)) throw new DomainError("invalid", "Choose what they'll do.", "staffRole");
  return raw as StaffRole;
}

/** Admins can always publish, so they never carry a website role of their own choosing. */
function parseWebsiteRole(raw: string | undefined, staffRole: StaffRole): WebsiteRole | null {
  if (staffRole === "ADMIN") return "PUBLISHER";
  if (raw === "EDITOR" || raw === "PUBLISHER") return raw;
  if (!raw || raw === "NONE") return null;
  throw new DomainError("invalid", "Choose Editor, Publisher or no website role.", "websiteRole");
}

async function recordStaffEvent(
  tx: Prisma.TransactionClient,
  actor: { userId: string; label: string },
  action: string,
  summary: string,
  data: Prisma.InputJsonValue,
  ipAddress?: string | null,
) {
  await tx.staffAuditEvent.create({ data: { actorUserId: actor.userId, actorLabel: actor.label, action, summary, data, ipAddress: ipAddress ?? null } });
}

export async function inviteStaff(db: Db, actor: StaffActor, input: StaffInviteInput, now = new Date()) {
  assertStaffCan(actor, "manageStaff");
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new DomainError("invalid", "Enter an email address like name@fourthgeneration.technology.", "email");
  const staffRole = parseStaffRole(input.staffRole);
  const websiteRole = parseWebsiteRole(input.websiteRole, staffRole);

  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email }, select: { kind: true, name: true, deactivatedAt: true } });
    if (existing?.kind === "STAFF") {
      throw new DomainError("conflict", existing.deactivatedAt ? `${existing.name} had a staff account that was deactivated. Turn it back on from the list.` : `${existing.name} already has a staff account.`, "email");
    }
    if (existing) throw new DomainError("invalid", "That address belongs to a customer account. Use their work address instead.", "email");
    const pending = await tx.staffInvitation.findFirst({ where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } });
    if (pending) throw new DomainError("conflict", "This person already has an invitation waiting. Send it again from the list.", "email");

    const invitation = await tx.staffInvitation.create({
      data: { email, staffRole, websiteRole, invitedById: actor.userId, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) },
    });
    await queueEmail(tx, { to: email, kind: "staff.invitation", payload: { invitationId: invitation.id } });
    const extra = staffRole !== "ADMIN" && websiteRole ? `, website ${WEBSITE_ROLE_LABEL[websiteRole]}` : "";
    await recordStaffEvent(tx, { userId: actor.userId, label: staffLabel(actor) }, "staff.invited", `Invited ${email} as ${STAFF_ROLE_LABEL[staffRole]} staff${extra}`, {
      invitationId: invitation.id,
      email,
      staffRole,
      websiteRole,
    });
    return invitation;
  });
}

/** Sends a fresh link that works for another 7 days. The previous link stops working. */
export async function resendStaffInvitation(db: Db, actor: StaffActor, invitationId: string, now = new Date()) {
  assertStaffCan(actor, "manageStaff");
  return db.$transaction(async (tx) => {
    const inv = await tx.staffInvitation.findUnique({ where: { id: invitationId } });
    if (!inv || inv.revokedAt || inv.acceptedAt) throw new DomainError("not-found", "That invitation is no longer open.");
    await tx.staffInvitation.update({ where: { id: inv.id }, data: { tokenHash: null, expiresAt: new Date(now.getTime() + INVITATION_TTL_MS) } });
    await queueEmail(tx, { to: inv.email, kind: "staff.invitation", payload: { invitationId: inv.id } });
    await recordStaffEvent(tx, { userId: actor.userId, label: staffLabel(actor) }, "staff.invitation_resent", `Sent the staff invitation to ${inv.email} again`, { invitationId: inv.id });
  });
}

export async function revokeStaffInvitation(db: Db, actor: StaffActor, invitationId: string, now = new Date()) {
  assertStaffCan(actor, "manageStaff");
  return db.$transaction(async (tx) => {
    const inv = await tx.staffInvitation.findUnique({ where: { id: invitationId } });
    if (!inv || inv.revokedAt || inv.acceptedAt) throw new DomainError("not-found", "That invitation is no longer open.");
    await tx.staffInvitation.update({ where: { id: inv.id }, data: { revokedAt: now, tokenHash: null } });
    await recordStaffEvent(tx, { userId: actor.userId, label: staffLabel(actor) }, "staff.invitation_revoked", `Withdrew the staff invitation to ${inv.email}`, { invitationId: inv.id });
  });
}

/** Invitations not yet accepted or withdrawn, newest first, with who sent them. */
export async function openStaffInvitations(db: Pick<PrismaClient, "staffInvitation">, actor: StaffActor, now = new Date()) {
  assertStaffCan(actor, "manageStaff");
  const rows = await db.staffInvitation.findMany({
    where: { acceptedAt: null, revokedAt: null },
    include: { invitedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((i) => ({
    id: i.id,
    email: i.email,
    staffRole: i.staffRole,
    websiteRole: i.websiteRole,
    invitedBy: i.invitedBy.name,
    expiresAt: i.expiresAt,
    expired: i.expiresAt.getTime() <= now.getTime(),
  }));
}

// ─── Accepting ───────────────────────────────────────────────────────

export type StaffInvitationLookup =
  | { state: "INVALID" }
  | {
      state: "VALID" | "EXPIRED" | "ACCEPTED" | "REVOKED" | "TAKEN";
      invitation: Prisma.StaffInvitationGetPayload<{ include: { invitedBy: { select: { name: true } } } }>;
    };

export async function lookupStaffInvitation(deps: AuthDeps, token: string): Promise<StaffInvitationLookup> {
  if (!token || token.length > 100) return { state: "INVALID" };
  const invitation = await deps.db.staffInvitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { invitedBy: { select: { name: true } } } });
  if (!invitation) return { state: "INVALID" };
  const now = clock(deps);
  if (invitation.revokedAt) return { state: "REVOKED", invitation };
  if (invitation.acceptedAt) return { state: "ACCEPTED", invitation };
  if (invitation.expiresAt.getTime() <= now.getTime()) return { state: "EXPIRED", invitation };
  // Someone made an account with this address after the invitation went out.
  if (await deps.db.user.findUnique({ where: { email: invitation.email }, select: { id: true } })) return { state: "TAKEN", invitation };
  return { state: "VALID", invitation };
}

/**
 * Creates the colleague's staff account. Opening the emailed link proves
 * they own the address. With a password (`withPassword`), returns a
 * session that can only set up the authenticator, as signing in for the
 * first time does. Without one (staff sign in with Microsoft), returns no
 * session: they sign in with Microsoft next and set up the authenticator
 * after that.
 */
export async function acceptStaffInvitation(
  deps: AuthDeps,
  token: string,
  input: { name: string; password?: string; withPassword: boolean },
  ctx: RequestContext = {},
): Promise<{ token: string | null }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new AuthError("invalid-input", "Enter your name.");
  const found = await lookupStaffInvitation(deps, token);
  if (found.state === "INVALID") throw new AuthError("invalid-input", "This invitation link isn't valid.");
  if (found.state === "TAKEN") throw new AuthError("email-taken", "An account with this email already exists.");
  let passwordHash = "";
  if (input.withPassword) {
    if (passwordStrength(input.password ?? "", [found.invitation.email, name]) !== "strong") {
      throw new AuthError("weak-password", "Choose a password of at least 12 characters that isn't easy to guess.");
    }
    passwordHash = await hashPassword(input.password ?? "");
  }
  const now = clock(deps);
  return deps.db.$transaction(async (tx) => {
    const claimed = await tx.staffInvitation.updateMany({
      where: { id: found.invitation.id, tokenHash: hashToken(token), acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now, tokenHash: null },
    });
    if (claimed.count !== 1) throw new AuthError("invalid-input", "This invitation has already been used, withdrawn or has expired.");
    const inv = found.invitation;
    if (await tx.user.findUnique({ where: { email: inv.email }, select: { id: true } })) {
      throw new AuthError("email-taken", "An account with this email already exists.");
    }
    const user = await tx.user.create({
      data: { kind: "STAFF", staffRole: inv.staffRole, websiteRole: inv.websiteRole, email: inv.email, name, passwordHash, emailVerifiedAt: now },
    });
    await tx.staffInvitation.update({ where: { id: inv.id }, data: { userId: user.id } });
    await recordStaffEvent(tx, { userId: user.id, label: name }, "staff.joined", `${name} accepted the invitation as ${STAFF_ROLE_LABEL[inv.staffRole]} staff`, {
      invitationId: inv.id,
      userId: user.id,
    }, ctx.ipAddress);
    return { token: input.withPassword ? await createSession(tx, user, "SETUP_PENDING", null, ctx, now) : null };
  });
}

// ─── Changing and deactivating ───────────────────────────────────────

export interface StaffUpdate {
  staffRole: string;
  active: boolean;
}

/**
 * Changes a colleague's staff role, or deactivates them (their sessions
 * end at once). Nobody changes their own account here, and there is
 * always at least one active Admin.
 */
export async function updateStaff(db: Db, actor: StaffActor, userId: string, input: StaffUpdate, now = new Date()) {
  assertStaffCan(actor, "manageStaff");
  const staffRole = parseStaffRole(input.staffRole);
  if (userId === actor.userId) throw new DomainError("invalid", "You can't change your own staff account. Ask another Admin.");
  return db.$transaction(async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, kind: "STAFF" } });
    if (!user?.staffRole) throw new DomainError("not-found", "That staff account doesn't exist.");
    const wasActiveAdmin = user.staffRole === "ADMIN" && !user.deactivatedAt;
    if (wasActiveAdmin && (!input.active || staffRole !== "ADMIN")) {
      const admins = await tx.user.count({ where: { kind: "STAFF", staffRole: "ADMIN", deactivatedAt: null } });
      if (admins <= 1) throw new DomainError("conflict", "There must always be an Admin. Make someone else an Admin first.");
    }
    const deactivatedAt = input.active ? null : (user.deactivatedAt ?? now);
    // A new Admin can publish; someone who stops being an Admin keeps the website role they had before.
    const websiteRole = staffRole === "ADMIN" ? "PUBLISHER" : user.websiteRole;
    const updated = await tx.user.update({ where: { id: user.id }, data: { staffRole, websiteRole, deactivatedAt } });
    if (!input.active) {
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
    }
    const label = { userId: actor.userId, label: staffLabel(actor) };
    if (!input.active && !user.deactivatedAt) {
      await recordStaffEvent(tx, label, "staff.deactivated", `Deactivated ${user.name}'s staff account`, { userId: user.id });
    } else if (input.active && user.deactivatedAt) {
      await recordStaffEvent(tx, label, "staff.reactivated", `Turned ${user.name}'s staff account back on as ${STAFF_ROLE_LABEL[staffRole]}`, { userId: user.id, staffRole });
    } else if (staffRole !== user.staffRole) {
      await recordStaffEvent(tx, label, "staff.role", `Changed ${user.name} from ${STAFF_ROLE_LABEL[user.staffRole]} to ${STAFF_ROLE_LABEL[staffRole]}`, {
        userId: user.id,
        from: user.staffRole,
        to: staffRole,
      });
    }
    return updated;
  });
}
