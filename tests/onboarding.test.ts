import { describe, expect, it } from "vitest";
import { linkTenant } from "../src/server/licences/licences";
import { bookMigration, checkDns, dnsRecords, earliestMove, finishOnboarding, lookUp, onboardings, requestTransfer, saveOnboarding, tickCustomerItem, tickStaffItem, type DnsResolver } from "../src/server/licences/onboarding";
import type { StaffActor } from "../src/server/staff/access";
import { addMember, db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

/** A resolver that answers from a table, and fails for anything else. */
function fakeDns(table: { txt?: Record<string, string[]>; mx?: Record<string, string>; cname?: Record<string, string> }): DnsResolver {
  const miss = () => Promise.reject(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
  return {
    resolveTxt: (h) => (table.txt?.[h] ? Promise.resolve(table.txt[h].map((v) => [v])) : miss()),
    resolveMx: (h) => (table.mx?.[h] ? Promise.resolve([{ exchange: table.mx[h], priority: 0 }]) : miss()),
    resolveCname: (h) => (table.cname?.[h] ? Promise.resolve([table.cname[h]]) : miss()),
  };
}

describe("DNS records", () => {
  it("lists what Microsoft 365 needs, proving the domain first", () => {
    const records = dnsRecords("MICROSOFT", "kgalehill.co.bw", "MS=ms48213377");
    expect(records.map((r) => [r.key, r.type, r.host, r.value, r.when])).toEqual([
      ["verify", "TXT", "@", "MS=ms48213377", "now"],
      ["mx", "MX", "@", "kgalehill-co-bw.mail.protection.outlook.com", "moving-day"],
      ["spf", "TXT", "@", "v=spf1 include:spf.protection.outlook.com -all", "moving-day"],
      ["autodiscover", "CNAME", "autodiscover", "autodiscover.outlook.com", "moving-day"],
    ]);
    expect(dnsRecords("GOOGLE", "acme.bw", null).map((r) => r.key)).toEqual(["mx", "spf"]);
  });

  it("finds records whatever the case or trailing dot, and treats a failed lookup as missing", async () => {
    const records = dnsRecords("MICROSOFT", "acme.co.bw", "MS=ms1");
    const found = await lookUp(fakeDns({ txt: { "acme.co.bw": ["ms=MS1", "v=spf1 -all"] }, cname: { "autodiscover.acme.co.bw": "AutoDiscover.Outlook.com." } }), "acme.co.bw", records);
    expect(found).toEqual({ verify: true, mx: false, spf: false, autodiscover: true });
  });

  it("gives staff two working days before a move", () => {
    // Thursday 1 October 2026: the earliest is Monday 5 October.
    expect(earliestMove(new Date("2026-10-01T09:00:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});

async function staff(): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Onalenna Setup", passwordHash: "x", kind: "STAFF", staffRole: "PROVISIONING", totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: "PROVISIONING" };
}

describe.skipIf(!hasDb)("setting a tenant up", () => {
  const now = new Date("2026-10-01T09:00:00Z");

  it("proves the domain once the record is found, and books the email move on one staff task", async () => {
    const org = await makeOrganisation("Kanye Kitchens");
    const s = { db, staff: await staff(), now };
    const tenant = await linkTenant(s, org.organisationId, { vendor: "MICROSOFT", primaryDomain: "kanyekitchens.co.bw" });
    const setup = await saveOnboarding(s, org.organisationId, { tenantId: tenant.id, kind: "NEW", verificationValue: "MS=ms77" });
    const ctx = { organisationId: org.organisationId, organisationName: "Kanye Kitchens", actor: org.owner, now };

    const first = await checkDns(org.tenant, ctx, setup.id, fakeDns({}));
    expect(first.onboarding.domainVerifiedAt).toBeNull();
    const second = await checkDns(org.tenant, ctx, setup.id, fakeDns({ txt: { "kanyekitchens.co.bw": ["MS=ms77"] } }));
    expect(second.onboarding.domainVerifiedAt).toEqual(now);
    const [view] = await onboardings(org.tenant);
    expect(view.records.find((r) => r.key === "verify")?.found).toBe(true);
    expect(view.records.find((r) => r.key === "mx")?.found).toBe(false);

    await expect(bookMigration(org.tenant, ctx, setup.id, { startsAt: new Date("2026-10-02T16:00:00Z"), source: "Google Workspace" })).rejects.toMatchObject({ field: "startsAt" });
    await expect(bookMigration(org.tenant, ctx, setup.id, { startsAt: new Date("2026-10-09T16:00:00Z"), source: "Carrier pigeon" })).rejects.toMatchObject({ field: "source" });
    const booked = await bookMigration(org.tenant, ctx, setup.id, { startsAt: new Date("2026-10-09T16:00:00Z"), source: "Our web host or cPanel", notes: "Twelve mailboxes on the old host." });
    const rebooked = await bookMigration(org.tenant, ctx, setup.id, { startsAt: new Date("2026-10-16T16:00:00Z"), source: "Our web host or cPanel" });
    expect(rebooked.migrationTaskId).toBe(booked.migrationTaskId);
    const task = await db.provisioningTask.findUniqueOrThrow({ where: { id: booked.migrationTaskId! } });
    expect(task).toMatchObject({ kind: "email_migration", expectedBy: new Date("2026-10-16T16:00:00Z") });
    expect(task.instructions).toMatch(/starting 2026-10-16 16:00 UTC/);

    const billing = await addMember(org.organisationId, "BILLING");
    await expect(checkDns(org.tenant, { ...ctx, actor: billing }, setup.id, fakeDns({}))).rejects.toMatchObject({ code: "forbidden" });

    await finishOnboarding(s, org.organisationId, setup.id);
    expect((await onboardings(org.tenant))[0].completedAt).toEqual(now);
    await expect(checkDns(org.tenant, ctx, setup.id, fakeDns({}))).rejects.toMatchObject({ code: "conflict" });
    const log = await org.tenant.auditEvent.findMany({ where: { action: { startsWith: "tenant." } }, orderBy: { createdAt: "asc" } });
    expect(log.map((e) => e.action)).toEqual(["tenant.linked", "tenant.setup_started", "tenant.domain_verified", "tenant.migration_booked", "tenant.migration_rebooked", "tenant.setup_finished"]);
  });

  it("brings an existing subscription across with a checklist shared with staff", async () => {
    const org = await makeOrganisation("Mahalapye Motors");
    const ctx = { organisationId: org.organisationId, organisationName: "Mahalapye Motors", actor: org.owner, now };
    await expect(requestTransfer(org.tenant, ctx, { vendor: "GOOGLE", domain: "not a domain", people: "8" })).rejects.toMatchObject({ field: "domain" });
    const { onboarding } = await requestTransfer(org.tenant, ctx, { vendor: "GOOGLE", domain: "MahalapyeMotors.com", people: "8" });
    await expect(requestTransfer(org.tenant, ctx, { vendor: "GOOGLE", domain: "other.com", people: "2" })).rejects.toMatchObject({ code: "conflict" });
    expect(await db.provisioningTask.count({ where: { organisationId: org.organisationId, kind: "tenant_transfer" } })).toBe(1);

    await tickCustomerItem(org.tenant, ctx, onboarding.id, "accept-invite", true);
    await expect(tickCustomerItem(org.tenant, ctx, onboarding.id, "billing-switched", true)).rejects.toMatchObject({ code: "invalid" });
    const s = { db, staff: await staff(), now };
    await expect(tickStaffItem(s, org.organisationId, onboarding.id, "accept-invite", true)).rejects.toMatchObject({ code: "invalid" });
    await tickStaffItem(s, org.organisationId, onboarding.id, "licences-confirmed", true);

    const [view] = await onboardings(org.tenant);
    expect(view.domain).toBe("mahalapyemotors.com");
    expect(view.checklist.map((i) => [i.key, i.doneBy])).toEqual([
      ["accept-invite", "Neo Kgosi"],
      ["tell-provider", null],
      ["licences-confirmed", "Onalenna Setup"],
      ["billing-switched", null],
    ]);

    // Another organisation can't touch it.
    const other = await makeOrganisation("Serowe Traders");
    await expect(tickCustomerItem(other.tenant, { ...ctx, organisationId: other.organisationId, actor: other.owner }, onboarding.id, "tell-provider", true)).rejects.toMatchObject({ code: "not-found" });
    await expect(tickStaffItem(s, other.organisationId, onboarding.id, "billing-switched", true)).rejects.toMatchObject({ code: "not-found" });
  });
});
