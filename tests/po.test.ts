import { beforeAll, describe, expect, it } from "vitest";
import { money } from "../src/lib/domain/money";
import { PAYMENT_METHODS } from "../src/server/billing/adapter";
import { applyDefaultPoNumbers, poNumbers, setInvoicePo } from "../src/server/billing/po";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { addMember, db, hasDb, makeOrganisation } from "./helpers";

describe.skipIf(!hasDb)("purchase order numbers", () => {
  let productId: string;
  beforeAll(async () => {
    productId = (await seedStubCatalogue(db))["ssl"];
  });

  async function orgWithInvoice() {
    const stub = new StubBillingAdapter(db);
    const org = await makeOrganisation("Francistown Freight");
    const billing = await scopedBilling(db, stub, org.organisationId);
    const placed = await billing.placeOrder({ paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId, quantity: 1, billingCycle: "monthly", recurringPrice: money(6000n, "BWP") }] });
    return { ...org, stub, billing, invoiceId: placed.invoiceId! };
  }

  it("keeps the PO in the console and the invoice notes, and records who set it", async () => {
    const o = await orgWithInvoice();
    await setInvoicePo(o.tenant, o.billing, o.organisationId, o.owner, o.invoiceId, "  PO-7781 ");
    expect((await poNumbers(o.tenant, [o.invoiceId])).get(o.invoiceId)).toBe("PO-7781");
    expect((await o.billing.getInvoice(o.invoiceId))?.notes).toBe("PO: PO-7781");
    expect(await db.auditEvent.count({ where: { organisationId: o.organisationId, action: "invoice.po_set" } })).toBe(1);

    await setInvoicePo(o.tenant, o.billing, o.organisationId, o.owner, o.invoiceId, "");
    expect((await poNumbers(o.tenant, [o.invoiceId])).size).toBe(0);
    expect((await o.billing.getInvoice(o.invoiceId))?.notes).toBeUndefined();
  });

  it("lets billing members set it but not read-only members, and checks the value", async () => {
    const o = await orgWithInvoice();
    const billingMember = await addMember(o.organisationId, "BILLING");
    const reader = await addMember(o.organisationId, "READ_ONLY");
    await setInvoicePo(o.tenant, o.billing, o.organisationId, billingMember, o.invoiceId, "A-1");
    await expect(setInvoicePo(o.tenant, o.billing, o.organisationId, reader, o.invoiceId, "A-2")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setInvoicePo(o.tenant, o.billing, o.organisationId, o.owner, o.invoiceId, "x".repeat(41))).rejects.toMatchObject({ field: "poNumber" });
    await expect(setInvoicePo(o.tenant, o.billing, o.organisationId, o.owner, o.invoiceId, "<script>")).rejects.toMatchObject({ field: "poNumber" });
  });

  it("can't set a PO on another organisation's invoice", async () => {
    const theirs = await orgWithInvoice();
    const mine = await orgWithInvoice();
    await expect(setInvoicePo(mine.tenant, mine.billing, mine.organisationId, mine.owner, theirs.invoiceId, "X-1")).rejects.toMatchObject({ code: "not-found" });
  });

  it("puts the default PO on new unpaid invoices, once", async () => {
    const o = await orgWithInvoice();
    await db.organisation.update({ where: { id: o.organisationId }, data: { defaultPoNumber: "KHL-DEFAULT" } });
    await applyDefaultPoNumbers(db, o.stub);
    await applyDefaultPoNumbers(db, o.stub);
    expect((await poNumbers(o.tenant, [o.invoiceId])).get(o.invoiceId)).toBe("KHL-DEFAULT");
    expect((await o.billing.getInvoice(o.invoiceId))?.notes).toBe("PO: KHL-DEFAULT");
    expect(await db.auditEvent.count({ where: { organisationId: o.organisationId, action: "invoice.po_default" } })).toBe(1);
  });
});
