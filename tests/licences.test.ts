import { beforeAll, describe, expect, it } from "vitest";
import { completeTask } from "../src/server/admin/tasks";
import { monthOf } from "../src/lib/domain/pricing";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { reconcileLicences, RECONCILE_KIND } from "../src/server/licences/reconcile";
import { changeQuantity, placeOrder, type OrderDeps } from "../src/server/orders/orders";
import { linkTenant, recordLicence, recordTenantUser, requestLicenceChange, tenantOverview, unusedLicences } from "../src/server/licences/licences";
import { ManualTenantProvider, StubTenantProvider } from "../src/server/licences/provider";
import type { StaffActor } from "../src/server/staff/access";
import { addMember, db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Onalenna Staff", passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

/** An organisation with a Microsoft tenant: 3 Business Standard licences, two people holding one each, and one person with none. */
async function withTenant() {
  const org = await makeOrganisation("Tlokweng Traders");
  const provisioning = await staff("PROVISIONING");
  const deps = { db, staff: provisioning };
  const ms = await linkTenant(deps, org.organisationId, { vendor: "MICROSOFT", primaryDomain: "Tlokweng.co.bw" });
  const standard = await recordLicence(deps, org.organisationId, { tenantId: ms.id, sku: "o365_business_standard", name: "Microsoft 365 Business Standard", purchased: 3 });
  const kabo = await recordTenantUser(deps, org.organisationId, { tenantId: ms.id, name: "Kabo Sello", email: "kabo@tlokweng.co.bw", licenceIds: [standard.id] });
  const lesedi = await recordTenantUser(deps, org.organisationId, { tenantId: ms.id, name: "Lesedi Moyo", email: "lesedi@tlokweng.co.bw", licenceIds: [standard.id] });
  const scanner = await recordTenantUser(deps, org.organisationId, { tenantId: ms.id, name: "Scanner", email: "scanner@tlokweng.co.bw", licenceIds: [] });
  return { ...org, provisioning, ms, standard, kabo, lesedi, scanner };
}

describe.skipIf(!hasDb)("users and licences", () => {
  let stubBilling: StubBillingAdapter;
  beforeAll(() => {
    stubBilling = new StubBillingAdapter(db);
  });

  it("shows each licence's use and flags the unused ones", async () => {
    const o = await withTenant();
    const [t] = await tenantOverview(o.tenant);
    expect(t.primaryDomain).toBe("tlokweng.co.bw");
    expect(t.licences).toEqual([expect.objectContaining({ sku: "O365_BUSINESS_STANDARD", purchased: 3, assigned: 2, unused: 1, free: 1 })]);
    expect(t.users.map((u) => [u.name, u.licences.length])).toEqual([
      ["Kabo Sello", 1],
      ["Lesedi Moyo", 1],
      ["Scanner", 0],
    ]);
    expect(unusedLicences([t])).toEqual([{ vendorLabel: "Microsoft 365", name: "Microsoft 365 Business Standard", unused: 1, purchased: 3 }]);
  });

  it("applies a change at once when the provider is automatic, and logs it", async () => {
    const o = await withTenant();
    const ctx = { organisationId: o.organisationId, organisationName: "Tlokweng Traders", actor: o.owner, provider: new StubTenantProvider() };
    const res = await requestLicenceChange(o.tenant, ctx, { kind: "ASSIGN", tenantUserId: o.scanner.id, licenceId: o.standard.id });
    expect(res.applied).toBe(true);
    expect(res.change.status).toBe("DONE");
    let [t] = await tenantOverview(o.tenant);
    expect(t.licences[0]).toMatchObject({ assigned: 3, unused: 0, free: 0 });

    // None left to give.
    await expect(requestLicenceChange(o.tenant, ctx, { kind: "ADD_USER", tenantId: o.ms.id, name: "Onkemetse", email: "onke@tlokweng.co.bw", licenceId: o.standard.id })).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringMatching(/All 3 Microsoft 365 Business Standard licences are in use/),
    });

    await requestLicenceChange(o.tenant, ctx, { kind: "REMOVE_USER", tenantUserId: o.kabo.id });
    [t] = await tenantOverview(o.tenant);
    expect(t.users.find((u) => u.id === o.kabo.id)).toMatchObject({ enabled: false, licences: [] });
    expect(t.licences[0]).toMatchObject({ assigned: 2, unused: 1 });

    const added = await requestLicenceChange(o.tenant, ctx, { kind: "ADD_USER", tenantId: o.ms.id, name: "Onkemetse Dube", email: "Onke@Tlokweng.co.bw", licenceId: o.standard.id });
    expect(added.applied).toBe(true);
    [t] = await tenantOverview(o.tenant);
    expect(t.users.find((u) => u.email === "onke@tlokweng.co.bw")?.licences).toHaveLength(1);

    const log = await o.tenant.auditEvent.findMany({ where: { action: { startsWith: "licence." } }, orderBy: { createdAt: "asc" } });
    expect(log.map((e) => e.summary)).toEqual([
      "Gave Scanner (scanner@tlokweng.co.bw) a Microsoft 365 Business Standard licence",
      "Removed Kabo Sello (kabo@tlokweng.co.bw) and freed their licences",
      "Added Onkemetse Dube (onke@tlokweng.co.bw) with a Microsoft 365 Business Standard licence",
    ]);
  });

  it("hands a change to staff when the provider is manual, and applies it when the task is done", async () => {
    const o = await withTenant();
    const ctx = { organisationId: o.organisationId, organisationName: "Tlokweng Traders", actor: o.owner, provider: new ManualTenantProvider() };
    const res = await requestLicenceChange(o.tenant, ctx, { kind: "ASSIGN", tenantUserId: o.scanner.id, licenceId: o.standard.id });
    expect(res.applied).toBe(false);
    expect(res.change.status).toBe("PENDING");
    const task = await db.provisioningTask.findUniqueOrThrow({ where: { id: res.change.taskId! } });
    expect(task).toMatchObject({ kind: "licence_change", family: "PRODUCTIVITY", organisationId: o.organisationId, orderId: null });
    expect(task.instructions).toMatch(/Assign a Microsoft 365 Business Standard licence to Scanner \(scanner@tlokweng.co.bw\)/);

    // Waiting: nothing held yet, but the last free licence is spoken for.
    let [t] = await tenantOverview(o.tenant);
    expect(t.licences[0]).toMatchObject({ assigned: 2, unused: 1, free: 0 });
    expect(t.users.find((u) => u.id === o.scanner.id)?.pending).toEqual([expect.objectContaining({ kind: "ASSIGN", licenceName: "Microsoft 365 Business Standard" })]);
    await expect(requestLicenceChange(o.tenant, ctx, { kind: "UNASSIGN", tenantUserId: o.scanner.id, licenceId: o.standard.id })).rejects.toMatchObject({ code: "conflict", message: expect.stringMatching(/already waiting/) });

    await completeTask({ db, adapter: stubBilling, staff: o.provisioning }, task.id);
    [t] = await tenantOverview(o.tenant);
    expect(t.licences[0]).toMatchObject({ assigned: 3, unused: 0 });
    expect(t.users.find((u) => u.id === o.scanner.id)).toMatchObject({ pending: [], licences: [expect.objectContaining({ name: "Microsoft 365 Business Standard" })] });
    expect((await db.licenceChange.findUniqueOrThrow({ where: { id: res.change.id } })).status).toBe("DONE");
  });

  it("lets only owners and admins change licences", async () => {
    const o = await withTenant();
    const billing = await addMember(o.organisationId, "BILLING");
    const admin = await addMember(o.organisationId, "ADMIN");
    const ctx = { organisationId: o.organisationId, organisationName: "Tlokweng Traders", provider: new StubTenantProvider() };
    await expect(requestLicenceChange(o.tenant, { ...ctx, actor: billing }, { kind: "UNASSIGN", tenantUserId: o.kabo.id, licenceId: o.standard.id })).rejects.toMatchObject({ code: "forbidden" });
    await expect(requestLicenceChange(o.tenant, { ...ctx, actor: admin }, { kind: "UNASSIGN", tenantUserId: o.kabo.id, licenceId: o.standard.id })).resolves.toMatchObject({ applied: true });
  });

  it("keeps each organisation's tenant to itself", async () => {
    const o = await withTenant();
    const other = await makeOrganisation("Serowe Traders");
    expect(await tenantOverview(other.tenant)).toEqual([]);
    const ctx = { organisationId: other.organisationId, organisationName: "Serowe Traders", actor: other.owner, provider: new StubTenantProvider() };
    await expect(requestLicenceChange(other.tenant, ctx, { kind: "REMOVE_USER", tenantUserId: o.kabo.id })).rejects.toMatchObject({ code: "not-found" });
    await expect(requestLicenceChange(other.tenant, ctx, { kind: "ADD_USER", tenantId: o.ms.id, name: "Intruder", email: "x@serowe.co.bw" })).rejects.toMatchObject({ code: "not-found" });
  });

  it("checks what staff record", async () => {
    const o = await withTenant();
    const deps = { db, staff: o.provisioning };
    await expect(recordLicence(deps, o.organisationId, { tenantId: o.ms.id, sku: "O365_BUSINESS_STANDARD", name: "Microsoft 365 Business Standard", purchased: 1 })).rejects.toMatchObject({
      code: "conflict",
      field: "purchased",
    });
    await expect(linkTenant(deps, o.organisationId, { vendor: "MICROSOFT", primaryDomain: "other.co.bw" })).rejects.toMatchObject({ code: "conflict" });
    await expect(linkTenant(deps, o.organisationId, { vendor: "GOOGLE", primaryDomain: "not a domain" })).rejects.toMatchObject({ field: "primaryDomain" });
    await expect(linkTenant({ db, staff: await staff("FINANCE") }, o.organisationId, { vendor: "GOOGLE", primaryDomain: "tlokweng.com" })).rejects.toMatchObject({ code: "forbidden" });
    const log = await o.tenant.auditEvent.findMany({ where: { action: { startsWith: "tenant." } } });
    expect(log.every((e) => e.actorKind === "STAFF" && e.visibleToCustomer)).toBe(true);
  });

  describe("seats and the nightly check", () => {
    beforeAll(async () => {
      const ids = await seedStubCatalogue(db);
      const prev = new Date();
      prev.setUTCMonth(prev.getUTCMonth() - 1);
      await seedCatalogue(db, ids, [monthOf(prev), monthOf(new Date())]);
    });

    /** Microsoft 365 Business Standard with 3 seats, live, and a tenant where all 3 are held. */
    async function withSeats() {
      const o = await withTenant();
      const billing = await scopedBilling(db, stubBilling, o.organisationId);
      const organisation = await db.organisation.findUniqueOrThrow({ where: { id: o.organisationId } });
      const deps: OrderDeps = { db: o.tenant, billing, organisation, actor: o.owner };
      const order = await placeOrder(deps, { slug: "microsoft-365-business-standard", quantity: 3, options: { domain: "tlokweng.co.bw" }, startNow: true });
      await completeTask({ db, adapter: stubBilling, staff: o.provisioning }, (await db.provisioningTask.findFirstOrThrow({ where: { orderId: order.id } })).id);
      await requestLicenceChange(o.tenant, { organisationId: o.organisationId, organisationName: "Tlokweng Traders", actor: o.owner, provider: new StubTenantProvider() }, { kind: "ASSIGN", tenantUserId: o.scanner.id, licenceId: o.standard.id });
      return { ...o, deps, serviceId: order.billingServiceIds[0] };
    }

    it("never lowers seats below the licences people hold, and keeps the tenant's count in step", async () => {
      const o = await withSeats();
      await expect(changeQuantity(o.deps, o.serviceId, 2)).rejects.toMatchObject({ code: "invalid", field: "quantity", message: "3 people hold Microsoft 365 Business Standard. Take back 1 in Users and licences before lowering to 2." });
      await requestLicenceChange(o.tenant, { organisationId: o.organisationId, organisationName: "Tlokweng Traders", actor: o.owner, provider: new StubTenantProvider() }, { kind: "REMOVE_USER", tenantUserId: o.kabo.id });
      await changeQuantity(o.deps, o.serviceId, 2);
      expect((await db.tenantLicence.findUniqueOrThrow({ where: { id: o.standard.id } })).purchased).toBe(2);
      await changeQuantity(o.deps, o.serviceId, 4);
      expect((await db.tenantLicence.findUniqueOrThrow({ where: { id: o.standard.id } })).purchased).toBe(4);
    });

    it("opens one staff task for each gap between billing and the tenant", async () => {
      const o = await withSeats();
      const mine = (gaps: Awaited<ReturnType<typeof reconcileLicences>>) => gaps.filter((g) => g.organisationId === o.organisationId);
      expect(mine(await reconcileLicences(db, stubBilling))).toEqual([]);

      // The portal shows 2 bought though billing charges for 3, and 3 people hold one.
      await db.tenantLicence.update({ where: { id: o.standard.id }, data: { purchased: 2 } });
      const gaps = mine(await reconcileLicences(db, stubBilling));
      expect(gaps.map((g) => g.problem).sort()).toEqual(["billing-differs", "over-assigned"]);
      await reconcileLicences(db, stubBilling);
      const tasks = await db.provisioningTask.findMany({ where: { organisationId: o.organisationId, kind: RECONCILE_KIND }, orderBy: { title: "asc" } });
      expect(tasks.map((t) => t.title)).toEqual([
        "3 people hold Microsoft 365 Business Standard but 2 are bought (Tlokweng Traders)",
        "Microsoft 365 Business Standard: billed for 3, tenant has 2 (Tlokweng Traders)",
      ]);
      expect(tasks[1].instructions).toMatch(/buy the rest: the customer is already paying for them/);
    });
  });
});
