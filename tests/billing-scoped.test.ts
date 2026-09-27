import { beforeAll, describe, expect, it } from "vitest";
import { money } from "../src/lib/domain/money";
import { PAYMENT_METHODS } from "../src/server/billing/adapter";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { db, hasDb, makeOrganisation } from "./helpers";

describe.skipIf(!hasDb)("billing bound to an organisation", () => {
  let productId: string;
  beforeAll(async () => {
    productId = (await seedStubCatalogue(db))["business-email"];
  });

  it("links each organisation to one billing client, once", async () => {
    const stub = new StubBillingAdapter(db);
    const org = await makeOrganisation("Mahalapye Motors");
    const [a, b] = await Promise.all([scopedBilling(db, stub, org.organisationId), scopedBilling(db, stub, org.organisationId)]);
    expect(a.clientId).toBe(b.clientId);
    const client = await a.client();
    expect(client).toMatchObject({ companyName: "Mahalapye Motors", firstName: "Neo", lastName: "Kgosi", currency: "BWP" });
    expect(await db.billingAccount.count({ where: { organisationId: org.organisationId } })).toBe(1);
  });

  it("can't reach another organisation's services, invoices or orders", async () => {
    const stub = new StubBillingAdapter(db);
    const mine = await scopedBilling(db, stub, (await makeOrganisation("Palapye Printers")).organisationId);
    const theirs = await scopedBilling(db, stub, (await makeOrganisation("Kanye Kitchens")).organisationId);
    const placed = await theirs.placeOrder({ paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId, quantity: 4, billingCycle: "monthly", recurringPrice: money(18000n, "BWP") }] });

    expect(await mine.getService(placed.serviceIds[0])).toBeNull();
    expect(await mine.getInvoice(placed.invoiceId!)).toBeNull();
    await expect(mine.setPurchaseOrder(placed.invoiceId!, "PO-1")).rejects.toMatchObject({ code: "not-found" });
    await expect(mine.recordPayment(placed.invoiceId!, { amount: money(18000n, "BWP"), gateway: "banktransfer", reference: "x", paidAt: new Date() })).rejects.toMatchObject({ code: "not-found" });
    await expect(mine.cancelOrder(placed.orderId)).rejects.toMatchObject({ code: "not-found" });
    await expect(mine.previewUpgrade(placed.serviceIds[0], { quantity: 1, recurringPrice: money(4500n, "BWP") })).rejects.toMatchObject({ code: "not-found" });
    expect((await theirs.getInvoice(placed.invoiceId!))?.status).toBe("unpaid");
  });

  it("refuses when the organisation is linked to a different engine", async () => {
    const org = await makeOrganisation();
    await scopedBilling(db, new StubBillingAdapter(db), org.organisationId);
    const fake = Object.assign(Object.create(StubBillingAdapter.prototype), { provider: "WHMCS" });
    await expect(scopedBilling(db, fake, org.organisationId)).rejects.toThrow(/linked to STUB/);
  });
});
