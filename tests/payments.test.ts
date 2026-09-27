import { beforeAll, describe, expect, it } from "vitest";
import { toDateOnly } from "../src/lib/dates";
import { money } from "../src/lib/domain/money";
import { PAYMENT_METHODS } from "../src/server/billing/adapter";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { OVERDUE_REASON, StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { finishCardPayment, startCardPayment, type PaymentDeps } from "../src/server/payments/card";
import { confirmEftPayment, rejectEftPayment, reportEftPayment } from "../src/server/payments/eft";
import { STUB_CARDS, StubCardGateway, stubCancel, stubPay } from "../src/server/payments/stub-card";
import type { Actor } from "../src/server/org/access";
import type { StaffActor } from "../src/server/staff/access";
import { addMember, db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

const P = (minor: bigint) => money(minor, "BWP");
const CARD = { expiry: "12/40", cvc: "123" };
let ids: Awaited<ReturnType<typeof seedStubCatalogue>>;

describe.skipIf(!hasDb)("payments", () => {
  beforeAll(async () => {
    ids = await seedStubCatalogue(db);
  });

  /** An organisation with one unpaid invoice for P 1,900.00, suspended for being overdue. */
  async function setUp(name = "Ramotswa Bakery") {
    const org = await makeOrganisation(name);
    const stub = new StubBillingAdapter(db);
    const billing = await scopedBilling(db, stub, org.organisationId);
    const placed = await billing.placeOrder({ paymentMethod: PAYMENT_METHODS.eft, createInvoice: true, items: [{ productId: ids["m365-standard"], quantity: 10, billingCycle: "monthly", recurringPrice: P(190000n) }] });
    await stub.acceptOrder(placed.orderId);
    const serviceId = placed.serviceIds[0];
    await stub.runModuleAction(serviceId, "suspend", OVERDUE_REASON);
    await db.organisation.update({ where: { id: org.organisationId }, data: { billingEmail: "accounts@ramotswa.co.bw" } });
    const payments = new StubCardGateway(db);
    const organisation = { id: org.organisationId, billingEmail: "accounts@ramotswa.co.bw", timeZone: "Africa/Gaborone", locale: "en-BW" };
    const deps = (actor: Actor = org.owner): PaymentDeps & { organisation: typeof organisation } => ({ db: org.tenant, billing, organisation, actor, payments, appUrl: "https://console.test" });
    return { ...org, stub, billing, payments, deps, invoiceId: placed.invoiceId!, serviceId };
  }

  async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
    const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Kagiso Staff", passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
    return { userId: user.id, name: user.name, staffRole: role };
  }

  it("pays an invoice by card once, even if the return page loads twice", async () => {
    const o = await setUp();
    const { redirectUrl, payment } = await startCardPayment(o.deps(), o.invoiceId);
    expect(redirectUrl).toBe(`/stub-gateway/${payment.gatewayRef}`);
    expect(payment).toMatchObject({ amountMinor: 190000n, currency: "BWP", status: "STARTED" });

    // Coming back before paying changes nothing.
    expect((await finishCardPayment(o.deps(), payment.gatewayRef)).status).toBe("STARTED");

    const back = await stubPay(db, payment.gatewayRef, { number: "4242 4242 4242 4242", ...CARD });
    expect(back).toBe(`https://console.test/app/billing/card-return?ref=${payment.gatewayRef}`);
    const [first, second] = await Promise.all([finishCardPayment(o.deps(), payment.gatewayRef), finishCardPayment(o.deps(), payment.gatewayRef)]);
    expect(first.status).toBe("SUCCEEDED");
    expect(second.status).toBe("SUCCEEDED");

    const invoice = await o.billing.getInvoice(o.invoiceId);
    expect(invoice).toMatchObject({ status: "paid", balance: P(0n) });
    expect(invoice!.payments).toHaveLength(1);
    expect(invoice!.payments[0]).toMatchObject({ gateway: "stubcard", reference: payment.gatewayRef, amountIn: P(190000n) });
    // Paying brings back the service suspended for this bill.
    expect((await o.billing.getService(o.serviceId))?.status).toBe("active");

    expect(await db.auditEvent.count({ where: { organisationId: o.organisationId, action: "payment.card_paid" } })).toBe(1);
    const emails = await db.outboundEmail.findMany({ where: { organisationId: o.organisationId, kind: "payment.confirmed" } });
    expect(emails.map((e) => e.toAddress).sort()).toEqual(["accounts@ramotswa.co.bw", o.email.toLowerCase()].sort());
  });

  it("records a declined or cancelled card without touching the invoice", async () => {
    const o = await setUp();
    const declined = await startCardPayment(o.deps(), o.invoiceId);
    await stubPay(db, declined.payment.gatewayRef, { number: STUB_CARDS.declined, ...CARD });
    expect(await finishCardPayment(o.deps(), declined.payment.gatewayRef)).toMatchObject({ status: "FAILED", failureReason: "The card company declined the card." });

    const cancelled = await startCardPayment(o.deps(), o.invoiceId);
    await stubCancel(db, cancelled.payment.gatewayRef);
    expect((await finishCardPayment(o.deps(), cancelled.payment.gatewayRef)).failureReason).toMatch(/cancelled/);

    expect((await o.billing.getInvoice(o.invoiceId))?.status).toBe("unpaid");
    expect(await db.auditEvent.count({ where: { organisationId: o.organisationId, action: "payment.card_failed" } })).toBe(2);
    expect(await db.outboundEmail.count({ where: { organisationId: o.organisationId, kind: "payment.confirmed" } })).toBe(0);
  });

  it("checks card details on the stub page", async () => {
    const o = await setUp();
    const { payment } = await startCardPayment(o.deps(), o.invoiceId);
    await expect(stubPay(db, payment.gatewayRef, { number: "4242 4242 4242 4241", expiry: "01/20", cvc: "1" })).rejects.toMatchObject({
      fieldErrors: { number: expect.any(String), expiry: expect.any(String), cvc: expect.any(String) },
    });
  });

  it("only lets people who pay start a payment, and only on their own unpaid invoices", async () => {
    const o = await setUp();
    const reader = await addMember(o.organisationId, "READ_ONLY");
    await expect(startCardPayment(o.deps(reader), o.invoiceId)).rejects.toMatchObject({ code: "forbidden" });
    const accounts = await addMember(o.organisationId, "BILLING");
    await expect(startCardPayment(o.deps(accounts), o.invoiceId)).resolves.toBeTruthy();

    const other = await setUp("Kanye Kitchens");
    await expect(startCardPayment(o.deps(), other.invoiceId)).rejects.toMatchObject({ code: "not-found" });
    await expect(reportEftPayment(o.deps(), other.invoiceId, { amount: "1900", paidOn: toDateOnly(new Date()), reference: "x" })).rejects.toMatchObject({ code: "not-found" });

    // Another organisation can't finish this organisation's card payment.
    const { payment } = await startCardPayment(o.deps(), o.invoiceId);
    await stubPay(db, payment.gatewayRef, { number: STUB_CARDS.pays, ...CARD });
    await expect(finishCardPayment(other.deps(), payment.gatewayRef)).rejects.toMatchObject({ code: "not-found" });
  });

  it("takes an EFT report, which staff confirm into a payment", async () => {
    const o = await setUp();
    const today = toDateOnly(new Date());
    await expect(reportEftPayment(o.deps(), o.invoiceId, { amount: "5,000", paidOn: "2099-01-01", reference: "" })).rejects.toMatchObject({
      fieldErrors: { amount: expect.stringMatching(/more than/), paidOn: expect.stringMatching(/future/), reference: expect.any(String) },
    });
    const eft = await reportEftPayment(o.deps(), o.invoiceId, { amount: "1,900.00", paidOn: today, reference: " INV-TEST " });
    expect(eft).toMatchObject({ status: "AWAITING_CONFIRMATION", amountMinor: 190000n, reference: "INV-TEST" });
    await expect(reportEftPayment(o.deps(), o.invoiceId, { amount: "1900", paidOn: today, reference: "again" })).rejects.toMatchObject({ code: "conflict" });
    // Nothing is credited on the customer's word.
    expect((await o.billing.getInvoice(o.invoiceId))?.status).toBe("unpaid");

    const support = await staff("SUPPORT");
    await expect(confirmEftPayment({ db, adapter: o.stub, staff: support }, eft.id)).rejects.toMatchObject({ code: "forbidden" });

    const finance = await staff("FINANCE");
    const confirmed = await confirmEftPayment({ db, adapter: o.stub, staff: finance }, eft.id);
    expect(confirmed).toMatchObject({ status: "CONFIRMED", confirmedById: finance.userId });
    await expect(confirmEftPayment({ db, adapter: o.stub, staff: finance }, eft.id)).rejects.toMatchObject({ code: "conflict" });

    const invoice = await o.billing.getInvoice(o.invoiceId);
    expect(invoice).toMatchObject({ status: "paid" });
    expect(invoice!.payments[0]).toMatchObject({ gateway: "banktransfer", reference: "INV-TEST" });

    // The staff action is in the customer's own audit log.
    const event = await o.tenant.auditEvent.findFirstOrThrow({ where: { action: "payment.eft_confirmed" } });
    expect({ ...event, summary: event.summary.replace(/\u00a0/gu, " ") }).toMatchObject({ actorKind: "STAFF", visibleToCustomer: true, summary: "Confirmed P 1,900.00 received by bank transfer for invoice " + invoice!.number });
    expect(await db.outboundEmail.count({ where: { organisationId: o.organisationId, kind: "payment.confirmed" } })).toBe(2);
  });

  it("confirms a part payment for what actually arrived", async () => {
    const o = await setUp();
    const eft = await reportEftPayment(o.deps(), o.invoiceId, { amount: "1900", paidOn: toDateOnly(new Date()), reference: "part" });
    const finance = await staff("ADMIN");
    await confirmEftPayment({ db, adapter: o.stub, staff: finance }, eft.id, { amountReceived: "900" });
    const invoice = await o.billing.getInvoice(o.invoiceId);
    expect(invoice).toMatchObject({ status: "unpaid", balance: P(100000n) });
  });

  it("tells the customer when staff can't find a transfer", async () => {
    const o = await setUp();
    const eft = await reportEftPayment(o.deps(), o.invoiceId, { amount: "1900", paidOn: toDateOnly(new Date()), reference: "INV" });
    const finance = await staff("FINANCE");
    await expect(rejectEftPayment({ db, adapter: o.stub, staff: finance }, eft.id, " ")).rejects.toMatchObject({ field: "note" });
    const rejected = await rejectEftPayment({ db, adapter: o.stub, staff: finance }, eft.id, "Nothing has arrived with that reference yet.");
    expect(rejected).toMatchObject({ status: "REJECTED", staffNote: "Nothing has arrived with that reference yet." });
    expect((await o.billing.getInvoice(o.invoiceId))?.status).toBe("unpaid");
    expect(await db.outboundEmail.count({ where: { organisationId: o.organisationId, kind: "payment.eft_not_found" } })).toBe(2);
    // They can tell us again once it's sorted.
    await expect(reportEftPayment(o.deps(), o.invoiceId, { amount: "1900", paidOn: toDateOnly(new Date()), reference: "INV" })).resolves.toBeTruthy();
  });
});
