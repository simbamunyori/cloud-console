import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { TENANT_MODELS } from "../src/server/db";
import { inviteMember } from "../src/server/org/members";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

describe("tenant models", () => {
  it("scopes every model that has an organisationId column", () => {
    const withOrg = Prisma.dmmf.datamodel.models
      .filter((m) => m.fields.some((f) => f.name === "organisationId"))
      .map((m) => m.name)
      // Outbound email is written by the system for sign-in notices too, and
      // is never read by customer pages.
      .filter((name) => name !== "OutboundEmail")
      // A readiness check is saved by a visitor with no account; the first
      // organisation to open its link claims it (src/server/tools/readiness-store.ts).
      .filter((name) => name !== "ReadinessCheck")
      // Staff-only: what the Odoo import made, across organisations.
      .filter((name) => name !== "MigrationRecord")
      // Staff and the referral partner's dashboard only: which partner brought each organisation (U9).
      .filter((name) => name !== "Referral");
    expect([...withOrg].sort()).toEqual([...TENANT_MODELS].sort());
  });
});

describe.skipIf(!hasDb)("tenant isolation", () => {
  it("never shows or changes another organisation's rows", async () => {
    const a = await makeOrganisation("Letlhakeng Farms");
    const b = await makeOrganisation("Serowe Traders");
    const invitation = await inviteMember(b.tenant, b.organisationId, b.owner, { email: uniqueEmail("b-guest"), role: "ADMIN" });

    // Reads
    expect(await a.tenant.invitation.findFirst({ where: { id: invitation.id } })).toBeNull();
    expect(await a.tenant.invitation.findUnique({ where: { id: invitation.id } })).toBeNull();
    expect(await a.tenant.membership.findFirst({ where: { id: b.owner.membershipId } })).toBeNull();
    const aMembers = await a.tenant.membership.findMany();
    expect(aMembers.every((m) => m.organisationId === a.organisationId)).toBe(true);
    const aAudit = await a.tenant.auditEvent.findMany();
    expect(aAudit.length).toBeGreaterThan(0);
    expect(aAudit.every((e) => e.organisationId === a.organisationId)).toBe(true);
    // An explicit filter for the other organisation is overridden, not obeyed.
    expect(await a.tenant.auditEvent.count({ where: { organisationId: b.organisationId } })).toBe(aAudit.length);

    // Writes
    const moved = await a.tenant.invitation.updateMany({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
    expect(moved.count).toBe(0);
    await expect(a.tenant.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } })).rejects.toThrow();
    await expect(a.tenant.membership.delete({ where: { id: b.owner.membershipId } })).rejects.toThrow();
    await expect(
      a.tenant.invitation.create({
        data: { organisationId: b.organisationId, email: "x@example.co.bw", role: "ADMIN", invitedById: a.owner.membershipId, expiresAt: new Date() },
      }),
    ).rejects.toThrow(/another organisation/);

    const untouched = await db.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(untouched.revokedAt).toBeNull();
  });

  it("keeps the audit log append-only", async () => {
    const a = await makeOrganisation();
    const event = await db.auditEvent.findFirstOrThrow({ where: { organisationId: a.organisationId } });
    await expect(db.auditEvent.update({ where: { id: event.id }, data: { summary: "Nothing happened" } })).rejects.toThrow();
    await expect(db.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow();
  });
});
