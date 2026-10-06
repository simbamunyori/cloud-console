import type { StaffRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { beginAuthenticatorSetup, confirmAuthenticatorSetup, getSession } from "../src/server/auth/service";
import { totpAt } from "../src/server/auth/totp";
import { MemoryEmailAdapter } from "../src/server/email/adapter";
import { deliverDue } from "../src/server/email/outbox";
import type { StaffActor } from "../src/server/staff/access";
import {
  acceptStaffInvitation,
  inviteStaff,
  lookupStaffInvitation,
  openStaffInvitations,
  resendStaffInvitation,
  revokeStaffInvitation,
  updateStaff,
} from "../src/server/staff/invitations";
import { db, hasDb, PASSWORD, testDeps, uniqueEmail } from "./helpers";

async function staffMember(staffRole: StaffRole, name = "Lesego Admin"): Promise<StaffActor & { email: string }> {
  const email = uniqueEmail("staff");
  const user = await db.user.create({ data: { kind: "STAFF", staffRole, email, name, passwordHash: "x", totpEnabled: true } });
  return { userId: user.id, name, staffRole, email };
}

/** Sends the queued email to `to` and returns the link in it. */
async function linkSentTo(to: string, path: string) {
  const adapter = new MemoryEmailAdapter();
  await deliverDue(db, adapter, new Date(), 50, { toAddress: to });
  const message = adapter.sent.filter((m) => m.to === to).at(-1);
  const match = message?.text.match(new RegExp(`${path}/([\\w%-]+)`));
  return { message, token: match ? decodeURIComponent(match[1]) : "" };
}

describe.skipIf(!hasDb)("staff invitations", () => {
  it("lets only Admins invite, and refuses addresses already in use", async () => {
    const admin = await staffMember("ADMIN");
    const support = await staffMember("SUPPORT");
    await expect(inviteStaff(db, support, { email: uniqueEmail("new"), staffRole: "SUPPORT" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(inviteStaff(db, admin, { email: "not-an-email", staffRole: "SUPPORT" })).rejects.toMatchObject({ field: "email" });
    await expect(inviteStaff(db, admin, { email: uniqueEmail("new"), staffRole: "OWNER" })).rejects.toMatchObject({ field: "staffRole" });
    await expect(inviteStaff(db, admin, { email: support.email, staffRole: "FINANCE" })).rejects.toMatchObject({ code: "conflict", field: "email" });
    const customer = await db.user.create({ data: { email: uniqueEmail("cust"), name: "A Customer", passwordHash: "x" } });
    await expect(inviteStaff(db, admin, { email: customer.email, staffRole: "FINANCE" })).rejects.toMatchObject({ field: "email" });

    const email = uniqueEmail("twice");
    await inviteStaff(db, admin, { email: email.toUpperCase(), staffRole: "FINANCE" });
    await expect(inviteStaff(db, admin, { email, staffRole: "FINANCE" })).rejects.toMatchObject({ code: "conflict" });
  });

  it("takes the colleague from the email to a signed-in account, and tells the inviter once", async () => {
    const admin = await staffMember("ADMIN", "Boitumelo Admin");
    const email = uniqueEmail("colleague");
    const inv = await inviteStaff(db, admin, { email, staffRole: "PROVISIONING", websiteRole: "EDITOR" });
    expect(inv.tokenHash).toBeNull();
    expect(await db.staffAuditEvent.findFirst({ where: { action: "staff.invited", actorUserId: admin.userId } })).toMatchObject({
      summary: `Invited ${email} as Provisioning staff, website Editor`,
    });
    expect((await openStaffInvitations(db, admin)).map((i) => i.email)).toContain(email);

    const { message, token } = await linkSentTo(email, "/admin/invite");
    expect(message?.subject).toBe("Boitumelo Admin invited you to the Fourth Generation Technologies staff console");
    expect(token).not.toBe("");
    const deps = testDeps();
    expect((await lookupStaffInvitation(deps, token)).state).toBe("VALID");

    await expect(acceptStaffInvitation(deps, token, { name: "Thato New", password: "short", withPassword: true })).rejects.toMatchObject({ code: "weak-password" });
    const { token: session } = await acceptStaffInvitation(deps, token, { name: "  Thato   New ", password: PASSWORD, withPassword: true });
    expect(session).not.toBeNull();
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ kind: "STAFF", staffRole: "PROVISIONING", websiteRole: "EDITOR", name: "Thato New" });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect((await getSession(deps, session, "STAFF"))?.stage).toBe("SETUP_PENDING");
    // The link works once.
    expect((await lookupStaffInvitation(deps, token)).state).toBe("INVALID");
    expect((await openStaffInvitations(db, admin)).map((i) => i.email)).not.toContain(email);

    // Nothing reaches the inviter until the authenticator is set up.
    expect(await db.outboundEmail.count({ where: { toAddress: admin.email, kind: "staff.ready" } })).toBe(0);
    const { secret } = await beginAuthenticatorSetup(deps, session!);
    await confirmAuthenticatorSetup(deps, session!, totpAt(secret));
    expect(await db.outboundEmail.count({ where: { toAddress: admin.email, kind: "staff.ready" } })).toBe(1);
    const ready = await linkSentTo(admin.email, "/admin/staff");
    expect(ready.message?.subject).toBe("Thato New has set up their staff account");
    expect(ready.message?.text).toContain("Provisioning");
    expect(await db.staffAuditEvent.findFirst({ where: { action: "staff.ready", actorUserId: user.id } })).toMatchObject({
      summary: "Thato New finished setting up their Provisioning staff account",
    });
  });

  it("makes no password when staff sign in with Microsoft", async () => {
    const admin = await staffMember("ADMIN");
    const email = uniqueEmail("ms");
    await inviteStaff(db, admin, { email, staffRole: "ADMIN", websiteRole: "NONE" });
    const { token } = await linkSentTo(email, "/admin/invite");
    const result = await acceptStaffInvitation(testDeps(), token, { name: "Kago Microsoft", withPassword: false });
    expect(result.token).toBeNull();
    // Admins can always publish.
    expect(await db.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ passwordHash: "", staffRole: "ADMIN", websiteRole: "PUBLISHER" });
  });

  it("only the newest link works, and withdrawn or expired ones don't", async () => {
    const admin = await staffMember("ADMIN");
    const email = uniqueEmail("resend");
    const inv = await inviteStaff(db, admin, { email, staffRole: "SUPPORT" });
    const first = (await linkSentTo(email, "/admin/invite")).token;
    await resendStaffInvitation(db, admin, inv.id);
    const second = (await linkSentTo(email, "/admin/invite")).token;
    const deps = testDeps();
    expect((await lookupStaffInvitation(deps, first)).state).toBe("INVALID");
    expect((await lookupStaffInvitation(deps, second)).state).toBe("VALID");

    const later = testDeps(() => new Date(Date.now() + 8 * 24 * 3_600_000));
    expect((await lookupStaffInvitation(later, second)).state).toBe("EXPIRED");
    await expect(acceptStaffInvitation(later, second, { name: "Too Late", password: PASSWORD, withPassword: true })).rejects.toMatchObject({ code: "invalid-input" });

    await revokeStaffInvitation(db, admin, inv.id);
    expect((await lookupStaffInvitation(deps, second)).state).toBe("INVALID");
    await expect(acceptStaffInvitation(deps, second, { name: "Withdrawn", password: PASSWORD, withPassword: true })).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("refuses an invitation once the address has an account", async () => {
    const admin = await staffMember("ADMIN");
    const email = uniqueEmail("taken");
    await inviteStaff(db, admin, { email, staffRole: "SUPPORT" });
    const { token } = await linkSentTo(email, "/admin/invite");
    await db.user.create({ data: { email, name: "Signed Up Meanwhile", passwordHash: "x" } });
    expect((await lookupStaffInvitation(testDeps(), token)).state).toBe("TAKEN");
    await expect(acceptStaffInvitation(testDeps(), token, { name: "Someone", password: PASSWORD, withPassword: true })).rejects.toMatchObject({ code: "email-taken" });
  });
});

describe.skipIf(!hasDb)("changing staff", () => {
  it("changes roles, deactivates with sign-out, and turns accounts back on", async () => {
    const admin = await staffMember("ADMIN");
    const other = await staffMember("SUPPORT", "Naledi Support");
    await expect(updateStaff(db, other, admin.userId, { staffRole: "SUPPORT", active: true })).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateStaff(db, admin, admin.userId, { staffRole: "SUPPORT", active: true })).rejects.toBeTruthy();

    await updateStaff(db, admin, other.userId, { staffRole: "FINANCE", active: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: other.userId } })).staffRole).toBe("FINANCE");
    expect(await db.staffAuditEvent.findFirst({ where: { action: "staff.role", actorUserId: admin.userId } })).toMatchObject({ summary: "Changed Naledi Support from Support to Finance" });

    const session = await db.session.create({
      data: { userId: other.userId, audience: "STAFF", tokenHash: `t-${Date.now()}-${Math.random()}`, stage: "ACTIVE", expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await updateStaff(db, admin, other.userId, { staffRole: "FINANCE", active: false });
    expect((await db.user.findUniqueOrThrow({ where: { id: other.userId } })).deactivatedAt).not.toBeNull();
    expect((await db.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).not.toBeNull();

    await updateStaff(db, admin, other.userId, { staffRole: "SUPPORT", active: true });
    expect(await db.user.findUniqueOrThrow({ where: { id: other.userId } })).toMatchObject({ deactivatedAt: null, staffRole: "SUPPORT" });
    expect(await db.staffAuditEvent.findFirst({ where: { action: "staff.reactivated", actorUserId: admin.userId } })).toBeTruthy();
  });

  it("always keeps an active Admin", async () => {
    // Inside a transaction that is rolled back, every other Admin in the shared test database is deactivated.
    const admin = await staffMember("ADMIN");
    const target = await staffMember("ADMIN", "Last Admin");
    const rollback = new Error("rollback");
    await expect(
      db.$transaction(async (tx) => {
        await tx.user.updateMany({ where: { kind: "STAFF", staffRole: "ADMIN", deactivatedAt: null, id: { not: target.userId } }, data: { deactivatedAt: new Date() } });
        const inside = { user: tx.user, staffInvitation: tx.staffInvitation, $transaction: (work: (t: typeof tx) => Promise<unknown>) => work(tx) } as unknown as typeof db;
        await expect(updateStaff(inside, admin, target.userId, { staffRole: "SUPPORT", active: true })).rejects.toMatchObject({ code: "conflict" });
        await expect(updateStaff(inside, admin, target.userId, { staffRole: "ADMIN", active: false })).rejects.toMatchObject({ code: "conflict" });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
