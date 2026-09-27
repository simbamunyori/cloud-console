import { beforeAll, describe, expect, it } from "vitest";
import { money } from "../src/lib/domain/money";
import { monthOf } from "../src/lib/domain/pricing";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { marketplace, productPrice, tldOffers } from "../src/server/catalogue/price-book";
import { productBySlug } from "../src/server/catalogue/catalogue";
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

  const bw = { code: "bw", currency: "BWP" };

  it("prices the marketplace from the market's approved book", async () => {
    const categories = await marketplace(db, bw, month);
    const standard = categories.flatMap((c) => c.products).find((p) => p.product.slug === "microsoft-365-business-standard")!;
    // US$ 12.50 x 13.45, +3%, +20%, rounded up: P 208.00 (as in the pricing unit test).
    expect(standard.price).toEqual(money(20800n, "BWP"));
    expect(categories.flatMap((c) => c.products).some((p) => p.product.slug === "domain-name")).toBe(false);
    expect(categories.flatMap((c) => c.products).some((p) => p.product.slug === "local-data-copy")).toBe(true);
  });

  it("offers each market its own currency and catalogue", async () => {
    const za = await marketplace(db, { code: "za", currency: "ZAR" }, month);
    const products = za.flatMap((c) => c.products);
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((p) => p.price.currency === "ZAR")).toBe(true);
    // Local data copy is kept in Botswana, so it's only offered there.
    expect(products.some((p) => p.product.slug === "local-data-copy")).toBe(false);
    const tlds = await tldOffers(db, { code: "za", currency: "ZAR", highlightedTlds: [".co.za"] }, month);
    expect(tlds[0].tld).toBe(".co.za");
    expect(tlds.some((t) => t.tld === ".co.bw")).toBe(false);
  });

  it("won't sell a product in a market where it isn't offered", async () => {
    const o = await setUp("Sandton Solar");
    await db.organisation.update({ where: { id: o.organisationId }, data: { billingMarket: "za", currency: "ZAR" } });
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: o.organisationId } });
    const deps: OrderDeps = { db: o.tenant, billing: o.billing, organisation, actor: o.owner };
    await expect(placeOrder(deps, { slug: "local-data-copy", quantity: "1", options: {} })).rejects.toMatchObject({ code: "not-found" });
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
    const before = (await productPrice(db, (await productBySlug(db, "managed-vps-small"))!, bw, month))!;
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
    const market = await db.market.findUniqueOrThrow({ where: { code: "bw" } });
    const offers = await tldOffers(db, market, month);
    const results = await searchDomains(o.tenant, o.billing, market, label, month);
    // The market's own endings first, then the rest on sale there.
    expect(results.map((r) => r.name)).toEqual(offers.slice(0, 5).map((t) => label + t.tld));
    expect(results.map((r) => r.name).slice(0, 2)).toEqual(market.highlightedTlds.map((t) => label + t));
    expect(results.some((r) => r.name.endsWith(".co.za"))).toBe(false);
    const coBw = offers.find((t) => t.tld === ".co.bw")!;
    expect(results.find((r) => r.name === `${label}.co.bw`)).toMatchObject({ available: true, supported: true, price: coBw.register });
    expect((await searchDomains(o.tenant, o.billing, market, "mascom.co.bw", month))[0]).toMatchObject({ name: "mascom.co.bw", available: false });

    const order = await registerDomain(o.deps(), `${label}.co.bw`, "2");
    expect(order).toMatchObject({ unitPriceMinor: coBw.register.amountMinor * 2n, monthlyTotalMinor: 0n });
    expect((await o.billing.listDomains()).find((d) => d.name === `${label}.co.bw`)?.status).toBe("pending");
    await expect(registerDomain(o.deps(), `${label}.co.bw`, "1")).rejects.toMatchObject({ code: "conflict" });
    await expect(registerDomain(o.deps(), `${label}.xyz`, "1")).rejects.toMatchObject({ code: "invalid" });
  });
});
