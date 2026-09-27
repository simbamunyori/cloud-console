import { describe, expect, it } from "vitest";
import { DomainError } from "../src/server/org/access";
import { inviteMember, revokeInvitation, teamOverview, updateMember } from "../src/server/org/members";
import { addMember, db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

describe.skipIf(!hasDb)("team", () => {
  it("refuses team changes from billing and read-only members, on the server", async () => {
    const org = await makeOrganisation();
    for (const role of ["BILLING", "READ_ONLY"] as const) {
      const member = await addMember(org.organisationId, role);
      await expect(inviteMember(org.tenant, org.organisationId, member, { email: uniqueEmail("x"), role: "READ_ONLY" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(updateMember(org.tenant, org.organisationId, member, org.owner.membershipId, { role: "READ_ONLY", active: true })).rejects.toBeInstanceOf(DomainError);
    }
  });

  it("lets admins manage everyone except owners", async () => {
    const org = await makeOrganisation();
    const admin = await addMember(org.organisationId, "ADMIN", "Kabo Admin");
    const billing = await addMember(org.organisationId, "BILLING");
    await expect(inviteMember(org.tenant, org.organisationId, admin, { email: uniqueEmail("o"), role: "OWNER" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateMember(org.tenant, org.organisationId, admin, org.owner.membershipId, { role: "ADMIN", active: true })).rejects.toMatchObject({ code: "forbidden" });
    await updateMember(org.tenant, org.organisationId, admin, billing.membershipId, { role: "READ_ONLY", active: true });
    expect((await db.membership.findUniqueOrThrow({ where: { id: billing.membershipId } })).role).toBe("READ_ONLY");
  });

  it("always keeps one owner", async () => {
    const org = await makeOrganisation();
    await expect(updateMember(org.tenant, org.organisationId, org.owner, org.owner.membershipId, { role: "ADMIN", active: true })).rejects.toMatchObject({ code: "conflict" });
    const second = await addMember(org.organisationId, "OWNER", "Second Owner");
    await updateMember(org.tenant, org.organisationId, second, org.owner.membershipId, { role: "ADMIN", active: true });
  });

  it("ends a removed member's sessions and records it", async () => {
    const org = await makeOrganisation();
    const admin = await addMember(org.organisationId, "ADMIN", "Leaving Person");
    const session = await db.session.create({
      data: { userId: admin.userId, audience: "CUSTOMER", tokenHash: `t-${Date.now()}-${Math.random()}`, stage: "ACTIVE", activeOrganisationId: org.organisationId, expiresAt: new Date(Date.now() + 3600_000) },
    });
    await updateMember(org.tenant, org.organisationId, org.owner, admin.membershipId, { role: "ADMIN", active: false });
    expect((await db.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).not.toBeNull();
    const event = await db.auditEvent.findFirstOrThrow({ where: { organisationId: org.organisationId, action: "member.removed" } });
    expect(event.summary).toBe("Removed Leaving Person from the team");
  });

  it("invites, lists and withdraws", async () => {
    const org = await makeOrganisation();
    const email = uniqueEmail("guest");
    const inv = await inviteMember(org.tenant, org.organisationId, org.owner, { email, role: "BILLING" });
    await expect(inviteMember(org.tenant, org.organisationId, org.owner, { email, role: "BILLING" })).rejects.toMatchObject({ code: "conflict" });
    expect((await teamOverview(org.tenant)).invitations.map((i) => i.email)).toEqual([email]);
    await revokeInvitation(org.tenant, org.organisationId, org.owner, inv.id);
    expect((await teamOverview(org.tenant)).invitations).toEqual([]);
  });
});
