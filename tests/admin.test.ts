import { beforeAll, describe, expect, it } from "vitest";
import { monthOf } from "../src/lib/domain/pricing";
import { money } from "../src/lib/domain/money";
import { nextMonth, parsePercent, parseRate, setCategoryMargin, setCurrencyBuffer, setNextMonthRate } from "../src/server/admin/pricing";
import { completeTask, startTask } from "../src/server/admin/tasks";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { productBySlug } from "../src/server/catalogue/catalogue";
import { approveAllSuggestions, approvePrice, bookRows, productItem, productPrice, setOffered } from "../src/server/catalogue/price-book";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { changeQuantity, placeOrder, type OrderDeps } from "../src/server/orders/orders";
import type { StaffActor } from "../src/server/staff/access";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

const month = monthOf(new Date());

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Onalenna Staff", passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

describe("pricing input", () => {
  it("reads percentages and rates exactly", () => {
    expect(parsePercent("20", "m")).toBe(2000);
    expect(parsePercent("12.5%", "m")).toBe(1250);
    expect(parsePercent("0.05", "m")).toBe(5);
    expect(() => parsePercent("12.345", "m")).toThrow();
    expect(() => parsePercent("-1", "m")).toThrow();
    expect(parseRate("13.45", "r")).toBe(13_450_000n);
    expect(parseRate("0.073412", "r")).toBe(73_412n);
    expect(() => parseRate("0", "r")).toThrow();
    expect(nextMonth("2026-12")).toBe("2027-01");
  });
});

describe.skipIf(!hasDb)("staff console", () => {
  let stub: StubBillingAdapter;
  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    const prev = new Date();
    prev.setUTCMonth(prev.getUTCMonth() - 1);
    await seedCatalogue(db, ids, [monthOf(prev), month]);
    stub = new StubBillingAdapter(db);
  });

  async function orderFor(name: string) {
    const org = await makeOrganisation(name);
    const billing = await scopedBilling(db, stub, org.organisationId);
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    const deps: OrderDeps = { db: org.tenant, billing, organisation, actor: org.owner };
    const order = await placeOrder(deps, { slug: "managed-vps-small", quantity: 1, options: { os: "Ubuntu 24.04 LTS" }, startNow: true });
    const task = await db.provisioningTask.findFirstOrThrow({ where: { orderId: order.id } });
    return { ...org, billing, deps, order, task };
  }

  it("finishing the last task activates the order, the service and emails the customer", async () => {
    const o = await orderFor("Palapye Printers");
    const support = await staff("SUPPORT");
    await expect(completeTask({ db, adapter: stub, staff: support }, o.task.id)).rejects.toMatchObject({ code: "forbidden" });

    const provisioning = await staff("PROVISIONING");
    const deps = { db, adapter: stub, staff: provisioning };
    expect(await startTask(deps, o.task.id)).toMatchObject({ status: "IN_PROGRESS", assigneeId: provisioning.userId });
    const done = await completeTask(deps, o.task.id, { note: "Your server is at 102.1.1.10." });
    expect(done.orderReady).toBe(true);
    expect(done.task).toMatchObject({ status: "DONE", completedById: provisioning.userId });
    await expect(completeTask(deps, o.task.id)).rejects.toMatchObject({ code: "conflict" });

    expect(await db.order.findUniqueOrThrow({ where: { id: o.order.id } })).toMatchObject({ status: "ACTIVE" });
    expect((await o.billing.getService(o.order.billingServiceIds[0]))?.status).toBe("active");
    const email = await db.outboundEmail.findFirstOrThrow({ where: { organisationId: o.organisationId, kind: "order.ready" } });
    expect(email.payload).toMatchObject({ orderId: o.order.id, note: "Your server is at 102.1.1.10." });

    // Every step is in the customer's own audit log, marked as staff.
    const events = await o.tenant.auditEvent.findMany({ where: { actorKind: "STAFF" }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.action)).toEqual(["task.started", "task.done", "order.ready"]);
    expect(events.every((e) => e.visibleToCustomer && e.actorLabel === provisioning.name)).toBe(true);
  });

  it("finishes a seat change without accepting anything in billing again", async () => {
    const o = await orderFor("Serowe Stores");
    const provisioning = await staff("PROVISIONING");
    await completeTask({ db, adapter: stub, staff: provisioning }, o.task.id);
    const change = await changeQuantity(o.deps, o.order.billingServiceIds[0], 1).catch((e) => e);
    // A VPS has no seats; use Microsoft 365 for the seat change.
    expect(change).toMatchObject({ code: "invalid" });
    const m365 = await placeOrder(o.deps, { slug: "microsoft-365-business-standard", quantity: 3, options: { domain: "serowe-stores.co.bw" }, startNow: true });
    await completeTask({ db, adapter: stub, staff: provisioning }, (await db.provisioningTask.findFirstOrThrow({ where: { orderId: m365.id } })).id);
    const seats = await changeQuantity(o.deps, m365.billingServiceIds[0], 5);
    const seatTask = await db.provisioningTask.findFirstOrThrow({ where: { orderId: seats.order.id } });
    const done = await completeTask({ db, adapter: stub, staff: provisioning }, seatTask.id);
    expect(done.orderReady).toBe(true);
    expect((await o.billing.getService(m365.billingServiceIds[0]))?.quantity).toBe(5);
  });

  it("changes margins, buffer and next month's rate, which only change suggestions until approved", async () => {
    const bw = { code: "bw", currency: "BWP" };
    const product = (await productBySlug(db, "microsoft-365-business-standard"))!;
    const item = productItem(product.slug);
    const before = await productPrice(db, product, bw, month);
    const beforeNext = await productPrice(db, product, bw, nextMonth(month));
    const finance = await staff("FINANCE");
    const admin = await staff("ADMIN");
    const deps = { db, staff: admin, month };
    await expect(setCategoryMargin({ ...deps, staff: finance }, "productivity", "25")).rejects.toMatchObject({ code: "forbidden" });

    const original = (await db.productCategory.findUniqueOrThrow({ where: { key: "productivity" } })).marginBps;
    const originalBuffer = (await db.pricingSettings.findUniqueOrThrow({ where: { id: "global" } })).currencyBufferBps;
    const originalRate = await db.fxRate.findUnique({ where: { month_base_quote: { month: nextMonth(month), base: "USD", quote: "BWP" } } });
    try {
      await setCategoryMargin(deps, "productivity", "25");
      await setCurrencyBuffer(deps, "5");
      await setNextMonthRate(deps, "USD", "BWP", "14.00");

      // Nothing customers pay changes until a price is approved.
      expect(await productPrice(db, product, bw, month)).toEqual(before);
      expect(await productPrice(db, product, bw, nextMonth(month))).toEqual(beforeNext);

      // Next month's suggestion: US$ 12.50 x 14.00 = 175.00, +5% = 183.75, +25% = 229.6875, rounded up to P 230.00.
      const row = (await bookRows(db, "bw", month)).rows.find((r) => r.item === item)!;
      expect(row).toMatchObject({ targetMonth: nextMonth(month), suggestion: { price: money(23000n, "BWP") } });

      await expect(approvePrice({ ...deps, staff: finance }, "bw", item)).rejects.toMatchObject({ code: "forbidden" });
      await expect(approvePrice(deps, "bw", item, { amount: "abc" })).rejects.toMatchObject({ field: "amount" });
      const entry = await approvePrice(deps, "bw", item);
      expect(entry).toMatchObject({ month: nextMonth(month), amountMinor: 23000n, suggestedMinor: 23000n, approvedById: admin.userId });
      expect(await productPrice(db, product, bw, month)).toEqual(before);
      expect(await productPrice(db, product, bw, nextMonth(month))).toEqual(money(23000n, "BWP"));

      // Staff can set a different price from the suggestion.
      await approvePrice(deps, "bw", item, { amount: "225" });
      expect(await productPrice(db, product, bw, nextMonth(month))).toEqual(money(22500n, "BWP"));

      const log = await db.pricingChange.findMany({ where: { userId: admin.userId }, orderBy: { createdAt: "asc" } });
      expect(log.map((c) => c.field)).toEqual(["margin:productivity", "buffer", `rate:USD/BWP:${nextMonth(month)}`, `price:bw:${item}:${nextMonth(month)}`, `price:bw:${item}:${nextMonth(month)}`]);
      expect(log[0]).toMatchObject({ fromValue: String(original), toValue: "2500" });
      expect(log[4]).toMatchObject({ fromValue: "23000", toValue: "22500" });
    } finally {
      await db.productCategory.update({ where: { key: "productivity" }, data: { marginBps: original } });
      await db.pricingSettings.update({ where: { id: "global" }, data: { currencyBufferBps: originalBuffer } });
      if (originalRate) await db.fxRate.update({ where: { id: originalRate.id }, data: { rateMicros: originalRate.rateMicros, setById: originalRate.setById } });
      else await db.fxRate.deleteMany({ where: { month: nextMonth(month), base: "USD", quote: "BWP" } });
      await db.priceBookEntry.deleteMany({ where: { approvedById: admin.userId } });
    }
  });

  it("approves every changed suggestion at once, and withdraws a product from a market", async () => {
    const admin = await staff("ADMIN");
    const deps = { db, staff: admin, month };
    const zw = { code: "zw", currency: "USD" };
    const original = (await db.productCategory.findUniqueOrThrow({ where: { key: "servers" } })).marginBps;
    const vps = (await productBySlug(db, "managed-vps-small"))!;
    try {
      await setCategoryMargin(deps, "servers", "55");
      const count = await approveAllSuggestions(deps, "zw");
      expect(count).toBeGreaterThan(0);
      expect(await approveAllSuggestions(deps, "zw")).toBe(0);
      expect(await db.priceBookEntry.count({ where: { approvedById: admin.userId, marketCode: "zw", month: nextMonth(month) } })).toBe(count);

      await setOffered(deps, "zw", productItem(vps.slug), false);
      expect(await productPrice(db, (await productBySlug(db, vps.slug))!, zw, month)).toBeNull();
      await setOffered(deps, "zw", productItem(vps.slug), true);
      expect(await productPrice(db, (await productBySlug(db, vps.slug))!, zw, month)).not.toBeNull();
      expect(await db.pricingChange.count({ where: { userId: admin.userId, field: { startsWith: "offered:zw:" } } })).toBe(2);
    } finally {
      await db.productCategory.update({ where: { key: "servers" }, data: { marginBps: original } });
      await db.priceBookEntry.deleteMany({ where: { approvedById: admin.userId } });
    }
  });
});
