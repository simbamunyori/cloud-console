import { beforeAll, describe, expect, it } from "vitest";
import { parseDateOnly } from "../src/lib/dates";
import { money } from "../src/lib/domain/money";
import { PAYMENT_METHODS } from "../src/server/billing/adapter";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { OVERDUE_REASON, StubBillingAdapter, withPoNote } from "../src/server/billing/stub/stub-adapter";
import { billingContract } from "./billing-contract";
import { db, hasDb } from "./helpers";

const P = (minor: bigint) => money(minor, "BWP");
let ids: Awaited<ReturnType<typeof seedStubCatalogue>>;

describe.skipIf(!hasDb)("stub billing", () => {
  beforeAll(async () => {
    ids = await seedStubCatalogue(db);
  });

  billingContract(
    "stub",
    () => new StubBillingAdapter(db),
    async () => ({
      productId: ids["m365-standard"],
      otherProductId: ids["m365-premium"],
      currency: "BWP",
      tld: ".co.bw",
      freshDomain: () => `contract-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.co.bw`,
      takenDomain: "mascom.co.bw",
      unsupportedDomain: "example.xyz",
    }),
  );

  /** A stub whose clock the test moves. */
  function clocked(start: string) {
    let now = new Date(`${start}T08:00:00Z`);
    const stub = new StubBillingAdapter(db, { now: () => now });
    return { stub, set: (day: string) => (now = new Date(`${day}T08:00:00Z`)) };
  }

  async function client(stub: StubBillingAdapter) {
    const { clientId } = await stub.createClient({ companyName: "Tlokweng Dairy", firstName: "Lesego", lastName: "Phiri", email: `dairy+${Date.now()}${Math.random()}@example.co.bw`, country: "BW", currency: "BWP" });
    return clientId;
  }

  it("charges the exact pro-rata share of a mid-period change", async () => {
    const { stub, set } = clocked("2026-09-01");
    const clientId = await client(stub);
    const placed = await stub.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: ids["m365-standard"], quantity: 10, billingCycle: "monthly", recurringPrice: P(190000n) }] });
    await stub.acceptOrder(placed.orderId);
    // Period 1 Sep to 30 Sep (30 days); on 16 Sep 15 days are left.
    set("2026-09-16");
    const preview = await stub.previewUpgrade(placed.serviceIds[0], { quantity: 12, recurringPrice: P(228000n) });
    expect(preview).toMatchObject({ daysLeft: 15, daysInPeriod: 30, dueNow: P(19000n) });
    // A reduction gives no credit and no invoice; the lower price starts next period.
    const down = await stub.previewUpgrade(placed.serviceIds[0], { quantity: 8, recurringPrice: P(152000n) });
    expect(down.dueNow).toEqual(P(-19000n));
    const applied = await stub.upgradeService(placed.serviceIds[0], { quantity: 8, recurringPrice: P(152000n) }, PAYMENT_METHODS.eft);
    expect(applied.invoiceId).toBeUndefined();
  });

  it("raises one monthly invoice per client for everything due, once", async () => {
    const { stub, set } = clocked("2026-06-01");
    const clientId = await client(stub);
    const a = await stub.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: ids["m365-standard"], quantity: 5, billingCycle: "monthly", recurringPrice: P(95000n) }] });
    const b = await stub.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: ids["vps-medium"], quantity: 1, billingCycle: "monthly", recurringPrice: P(85000n) }] });
    await stub.acceptOrder(a.orderId);
    await stub.acceptOrder(b.orderId);

    set("2026-06-20");
    expect((await stub.runBillingCycle()).length).toBeGreaterThanOrEqual(0);
    const before = (await stub.listInvoices(clientId)).length;
    // 7 days before 1 July, both services fall due together.
    set("2026-06-24");
    const made = await stub.runBillingCycle();
    const mine = (await stub.listInvoices(clientId)).filter((i) => made.includes(i.invoiceId));
    expect(mine).toHaveLength(1);
    const invoice = (await stub.getInvoice(clientId, mine[0].invoiceId))!;
    expect(invoice.total).toEqual(P(180000n));
    expect(invoice.dueOn).toEqual(parseDateOnly("2026-07-01"));
    expect(invoice.lines.map((l) => l.description)).toEqual([
      "Microsoft 365 Business Standard x 5 (1 – 31 Jul 2026)",
      "Managed VPS, medium (1 – 31 Jul 2026)",
    ]);
    expect(invoice.number).toMatch(/^INV-2026-\d{4,}$/);

    // Running again the same day bills nothing new.
    await stub.runBillingCycle();
    expect((await stub.listInvoices(clientId)).length).toBe(before + 1);
    expect((await stub.getService(clientId, a.serviceIds[0]))?.nextDueOn).toEqual(parseDateOnly("2026-08-01"));
  });

  it("brings back a service suspended for non-payment once the bill is paid", async () => {
    const { stub } = clocked("2026-09-01");
    const clientId = await client(stub);
    const placed = await stub.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: ids["web-hosting"], quantity: 1, billingCycle: "monthly", recurringPrice: P(12000n) }] });
    await stub.acceptOrder(placed.orderId);
    await stub.runModuleAction(placed.serviceIds[0], "suspend", OVERDUE_REASON);
    await stub.recordPayment(placed.invoiceId!, { amount: P(12000n), gateway: PAYMENT_METHODS.eft, reference: "FNB 88213", paidAt: new Date() });
    expect((await stub.getService(clientId, placed.serviceIds[0]))?.status).toBe("active");
  });

  it("adds VAT on taxed lines when it is switched on", async () => {
    const stub = new StubBillingAdapter(db, { taxRateBps: 1400 });
    const clientId = await client(stub);
    const placed = await stub.placeOrder(clientId, { paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: ids["web-hosting"], quantity: 1, billingCycle: "monthly", recurringPrice: P(12345n) }] });
    const invoice = (await stub.getInvoice(clientId, placed.invoiceId!))!;
    expect(invoice.tax).toEqual(P(1728n));
    expect(invoice.total).toEqual(P(14073n));
  });
});

describe("purchase order notes", () => {
  it("replaces only the PO line", () => {
    expect(withPoNote(null, "4471")).toBe("PO: 4471");
    expect(withPoNote("Thanks\nPO: 1", "2")).toBe("PO: 2\nThanks");
    expect(withPoNote("PO: 1", null)).toBeNull();
    expect(withPoNote("PO: 1\nKeep", " ")).toBe("Keep");
  });
});
