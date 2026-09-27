import { beforeAll, describe, expect, it } from "vitest";
import { money } from "../src/lib/domain/money";
import { monthOf } from "../src/lib/domain/pricing";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { marketplace } from "../src/server/catalogue/catalogue";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { changeQuantity, placeOrder, previewQuantityChange, registerDomain, searchDomains, type OrderDeps } from "../src/server/orders/orders";
import type { Actor } from "../src/server/org/access";
import { addMember, db, hasDb, makeOrganisation } from "./helpers";

const month = monthOf(new Date());

describe.skipIf(!hasDb)("ordering", () => {
  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    const prev = new Date();
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    await seedCatalogue(db, ids, [monthOf(prev), month]);
  });

  async function setUp(name = "Molepolole Mills") {
    const org = await makeOrganisation(name);
    const stub = new StubBillingAdapter(db);
    const billing = await scopedBilling(db, stub, org.organisationId);
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    const deps = (actor: Actor = org.owner): OrderDeps => ({ db: org.tenant, billing, organisation, actor });
    return { ...org, stub, billing, deps };
  }

  it("prices the marketplace from cost, margin, buffer and rate", async () => {
    const categories = await marketplace(db, "BWP", month);
    const standard = categories.flatMap((c) => c.products).find((p) => p.product.slug === "microsoft-365-business-standard")!;
    // US$ 12.50 x 13.45, +3%, +20%, rounded up: P 208.00 (as in the pricing unit test).
    expect(standard.price).toEqual(money(20800n, "BWP"));
    expect(categories.flatMap((c) => c.products).some((p) => p.product.slug === "domain-name")).toBe(false);
  });

  it("places an order: invoice, pending service, staff task, audit and email", async () => {
    const o = await setUp();
    const order = await placeOrder(o.deps(), { slug: "microsoft-365-business-standard", quantity: "5", options: { domain: "Molepolole-Mills.co.bw" } });
    expect(order).toMatchObject({ quantity: 5, unitPriceMinor: 20800n, monthlyTotalMinor: 104000n, status: "SETTING_UP" });
    expect(order.reference).toMatch(/^ORD-[2-9A-Z]{6}$/);
    expect(order.expectedBy.getTime()).toBeGreaterThan(Date.now() + 7 * 3_600_000);

    const service = await o.billing.getService(order.billingServiceIds[0]);
    expect(service).toMatchObject({ status: "pending", quantity: 5, recurring: money(104000n, "BWP"), domain: "molepolole-mills.co.bw" });
    expect((await o.billing.getInvoice(order.billingInvoiceId!))?.total).toEqual(money(104000n, "BWP"));

    const task = await db.provisioningTask.findFirstOrThrow({ where: { orderId: order.id } });
    expect(task).toMatchObject({ status: "OPEN", family: "PRODUCTIVITY", kind: "provision" });
    expect(task.instructions).toContain("Buy 5 licences of Microsoft 365 Business Standard");
    expect(task.instructions).toContain("molepolole-mills.co.bw");
    expect(await db.auditEvent.findFirst({ where: { organisationId: o.organisationId, action: "order.placed" } })).toMatchObject({ summary: `Ordered Microsoft 365 Business Standard for 5 users (${order.reference})` });
    expect(await db.outboundEmail.count({ where: { organisationId: o.organisationId, kind: "order.received" } })).toBe(1);
  });

  it("checks quantity and options, and only lets owners and admins order", async () => {
    const o = await setUp();
    await expect(placeOrder(o.deps(), { slug: "microsoft-365-business-basic", quantity: "0", options: { domain: "a.co.bw" } })).rejects.toMatchObject({ field: "quantity" });
    await expect(placeOrder(o.deps(), { slug: "microsoft-365-business-basic", quantity: "2", options: {} })).rejects.toMatchObject({ fieldErrors: { option_domain: expect.any(String) } });
    await expect(placeOrder(o.deps(), { slug: "managed-vps-small", quantity: "1", options: { os: "Windows 95" } })).rejects.toMatchObject({ fieldErrors: { option_os: expect.any(String) } });
    await expect(placeOrder(o.deps(), { slug: "domain-name", quantity: "1", options: {} })).rejects.toMatchObject({ code: "not-found" });
    for (const role of ["BILLING", "READ_ONLY"] as const) {
      const member = await addMember(o.organisationId, role);
      await expect(placeOrder(o.deps(member), { slug: "thebe", quantity: "1", options: {} })).rejects.toMatchObject({ code: "forbidden" });
    }
    expect(await db.order.count({ where: { organisationId: o.organisationId } })).toBe(0);
  });

  it("keeps this month's price when staff change the margin", async () => {
    const o = await setUp();
    await placeOrder(o.deps(), { slug: "managed-vps-small", quantity: "1", options: { os: "Debian 12" } });
    const before = await db.monthlyPrice.findFirstOrThrow({ where: { product: { slug: "managed-vps-small" }, month, currency: "BWP" } });
    await db.productCategory.update({ where: { key: "servers" }, data: { marginBps: 9000 } });
    try {
      const order = await placeOrder(o.deps(), { slug: "managed-vps-small", quantity: "1", options: { os: "Debian 12" } });
      expect(order.unitPriceMinor).toBe(before.amountMinor);
    } finally {
      await db.productCategory.update({ where: { key: "servers" }, data: { marginBps: 4000 } });
    }
  });

  it("changes the number of users, charging the part month", async () => {
    const o = await setUp();
    const order = await placeOrder(o.deps(), { slug: "backup-microsoft-365", quantity: "5", options: {} });
    await o.stub.acceptOrder(order.billingOrderId!);
    const serviceId = order.billingServiceIds[0];

    const preview = await previewQuantityChange(o.deps(), serviceId, "8");
    expect(preview).toMatchObject({ from: 5, to: 8 });
    expect(preview.preview.newRecurring.amountMinor).toBe(preview.unitPrice.amountMinor * 8n);
    await expect(previewQuantityChange(o.deps(), serviceId, "5")).rejects.toMatchObject({ field: "quantity" });

    const { order: change } = await changeQuantity(o.deps(), serviceId, "8");
    expect(change).toMatchObject({ changesServiceId: serviceId, quantity: 8 });
    expect((await o.billing.getService(serviceId))?.quantity).toBe(8);
    expect(await db.provisioningTask.findFirst({ where: { orderId: change.id, kind: "change_quantity" } })).not.toBeNull();
    expect(await db.auditEvent.findFirst({ where: { organisationId: o.organisationId, action: "service.quantity_changed" } })).toMatchObject({ summary: "Changed Backup for Microsoft 365 from 5 to 8" });

    const other = await setUp("Selebi Supplies");
    await expect(previewQuantityChange(other.deps(), serviceId, "9")).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses to change a service that can't take a quantity", async () => {
    const o = await setUp();
    const order = await placeOrder(o.deps(), { slug: "thebe", quantity: "1", options: {} });
    await o.stub.acceptOrder(order.billingOrderId!);
    await expect(previewQuantityChange(o.deps(), order.billingServiceIds[0], "2")).rejects.toMatchObject({ code: "invalid" });
  });

  it("searches and registers a domain", async () => {
    const o = await setUp();
    const label = `mills${Date.now().toString(36)}`;
    const results = await searchDomains(o.billing, "BWP", label);
    expect(results.map((r) => r.name)).toEqual([".co.bw", ".bw", ".com", ".africa", ".co.za"].map((t) => label + t));
    expect(results[0]).toMatchObject({ available: true, supported: true, price: money(18000n, "BWP") });
    expect((await searchDomains(o.billing, "BWP", "mascom.co.bw"))[0]).toMatchObject({ name: "mascom.co.bw", available: false });

    const order = await registerDomain(o.deps(), `${label}.co.bw`, "2");
    expect(order).toMatchObject({ unitPriceMinor: 36000n, monthlyTotalMinor: 0n });
    expect((await o.billing.listDomains()).find((d) => d.name === `${label}.co.bw`)?.status).toBe("pending");
    await expect(registerDomain(o.deps(), `${label}.co.bw`, "1")).rejects.toMatchObject({ code: "conflict" });
    await expect(registerDomain(o.deps(), `${label}.xyz`, "1")).rejects.toMatchObject({ code: "invalid" });
  });
});
