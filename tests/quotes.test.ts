import { beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn, toDateOnly } from "../src/lib/dates";
import { monthOf } from "../src/lib/domain/pricing";
import { saveCategory, saveFamily, saveProduct } from "../src/server/admin/catalogue";
import { hashToken, newToken } from "../src/server/auth/tokens";
import { scopedBilling } from "../src/server/billing/scoped";
import { linkStubProduct, seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import type { OrderDeps } from "../src/server/orders/orders";
import type { Actor } from "../src/server/org/access";
import {
  acceptQuote,
  claimQuote,
  closeQuote,
  declineQuoteByToken,
  quoteByToken,
  quoteState,
  requestQuote,
  saveQuote,
  sendQuote,
  type QuoteDraftInput,
} from "../src/server/quotes/quotes";
import type { StaffActor } from "../src/server/staff/access";
import { addMember, db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

const month = monthOf(new Date());
const today = todayIn("Africa/Gaborone");
const inDays = (n: number) => toDateOnly(addDays(today, n));

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Kagiso Staff", passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

const request = (over: Record<string, string> = {}) => ({
  name: "Neo Ramotswe",
  company: "Ramotswe Logistics",
  email: uniqueEmail("neo"),
  phone: "+267 71 000 000",
  country: "BW",
  need: "A link between our two depots, with someone to look after it.",
  ...over,
});

describe.skipIf(!hasDb)("quotes", () => {
  let admin: StaffActor;
  let productId: string;
  let productSlug: string;

  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, [month]);
    admin = await staff("ADMIN");
    const deps = { db, staff: admin, month };
    const key = `quotes-${Math.random().toString(36).slice(2, 8)}`;
    await saveFamily(deps, { key, name: "Site links", description: "Links between offices.", connector: "SERVICES", status: "LIVE", sortOrder: "950" });
    await saveCategory(deps, { key: `${key}-cat`, name: "Site links", description: "Links between offices.", familyKey: key, sortOrder: "1", margin: "30" });
    productSlug = `${key}-link`;
    await saveProduct(deps, {
      slug: productSlug,
      name: "Managed site link",
      summary: "A link between two of your offices, run by us.",
      includes: "Design\nMonitoring",
      excludes: "",
      categoryKey: `${key}-cat`,
      unitLabel: "per link",
      quantityAllowed: false,
      minQuantity: "1",
      setupHours: "40",
      minTermMonths: "12",
      commitmentNote: "",
      cost: "0",
      costCurrency: "BWP",
      fixedPrice: "",
      fixedPriceCurrency: "BWP",
      markets: ["bw"],
      fulfilment: "QUOTE",
      status: "LIVE",
      sortOrder: "1",
    });
    await linkStubProduct(db, productSlug);
    productId = (await db.product.findUniqueOrThrow({ where: { slug: productSlug } })).id;
  });

  const draft = (over: Partial<QuoteDraftInput> = {}): QuoteDraftInput => ({
    market: "bw",
    productId,
    message: "Thanks for your time on the phone.",
    validUntil: inDays(14),
    lines: [
      { kind: "MONTHLY", description: "Managed link, 100 Mbps", quantity: "1", unitPrice: "4500" },
      { kind: "MONTHLY", description: "Monitoring", quantity: "2", unitPrice: "250" },
      { kind: "ONE_OFF", description: "Installation", quantity: "1", unitPrice: "12000" },
    ],
    ...over,
  });

  /** Sends the quote and returns the link token the email would carry. */
  async function sent(reference: string) {
    await saveQuote({ db, staff: admin }, reference, draft());
    await sendQuote({ db, staff: admin }, reference);
    const token = newToken();
    await db.quote.update({ where: { reference }, data: { tokenHash: hashToken(token) } });
    return token;
  }

  async function customer(name: string) {
    const org = await makeOrganisation(name);
    const billing = await scopedBilling(db, new StubBillingAdapter(db), org.organisationId);
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    const deps = (actor: Actor = org.owner): OrderDeps => ({ db: org.tenant, billing, organisation, actor });
    return { ...org, organisation, deps, billing };
  }

  it("takes a request from anyone and tells them and the support team", async () => {
    const quote = await requestQuote(db, { ...request(), product: productSlug }, { market: "bw" });
    expect(quote).toMatchObject({ status: "NEW", market: "bw", organisationId: null, productId });
    expect(quote.reference).toMatch(/^QUO-/);
    const emails = await db.outboundEmail.findMany({ where: { payload: { path: ["quoteId"], equals: quote.id } } });
    expect(emails.map((e) => e.kind).sort()).toEqual(["quote.new_request", "quote.requested"]);
  });

  it("checks the form", async () => {
    await expect(requestQuote(db, request({ email: "nope", country: "XX", need: "hi", phone: "" }), { market: "bw" })).rejects.toMatchObject({
      fieldErrors: { email: expect.any(String), country: "Choose your country.", need: expect.any(String), phone: expect.any(String) },
    });
  });

  it("won't send a quote until it has a product, a line and a date, and lets only quote staff work it", async () => {
    const q = await requestQuote(db, request(), { market: "bw" });
    await expect(sendQuote({ db, staff: admin }, q.reference)).rejects.toThrow(/choose the product.*add at least one price line.*set the date/);
    await expect(saveQuote({ db, staff: await staff("FINANCE") }, q.reference, draft())).rejects.toThrow(/staff role/);
    await expect(saveQuote({ db, staff: admin }, q.reference, draft({ validUntil: inDays(-1), lines: [{ kind: "MONTHLY", description: "", quantity: "0", unitPrice: "lots" }] }))).rejects.toMatchObject({
      fieldErrors: { validUntil: expect.any(String), "lines.0.description": expect.any(String), "lines.0.quantity": expect.any(String), "lines.0.unitPrice": expect.any(String) },
    });
  });

  it("goes from a public request to an order at the quoted price once someone with an account accepts", async () => {
    const q = await requestQuote(db, request(), { market: "bw" });
    const token = await sent(q.reference);
    expect((await quoteByToken(db, token))?.quote.status).toBe("SENT");

    const c = await customer("Depot Two Logistics");
    // A member who can't order can't take it into the account.
    const viewer = await addMember(c.organisationId, "READ_ONLY", "Kabo Viewer");
    await expect(claimQuote(db, token, { actor: viewer, organisation: c.organisation })).rejects.toThrow();

    const reference = await claimQuote(db, token, { actor: c.owner, organisation: c.organisation });
    const order = await acceptQuote(c.deps(), reference, true);
    expect(order).toMatchObject({ unitPriceMinor: 500000n, monthlyTotalMinor: 500000n, currency: "BWP", productId, quantity: 1 });
    expect(order.options).toMatchObject({ Quote: q.reference });

    // Monthly lines are the service's price; the one-off line is on its first invoice.
    const invoice = (await c.billing.getInvoice(order.billingInvoiceId!))!;
    expect(invoice.lines.find((l) => l.description === "Installation")?.amount.amountMinor).toBe(1200000n);
    expect(invoice.lines.some((l) => l.kind === "service" && l.amount.amountMinor === 500000n)).toBe(true);

    const after = await db.quote.findUniqueOrThrow({ where: { id: q.id } });
    expect(after).toMatchObject({ status: "ACCEPTED", orderId: order.id, organisationId: c.organisationId, tokenHash: null });
    const task = await db.provisioningTask.findFirst({ where: { orderId: order.id } });
    expect(task).toBeTruthy();
    expect(await db.auditEvent.findFirst({ where: { organisationId: c.organisationId, action: "quote.accepted" } })).toBeTruthy();

    // Accepting twice orders nothing more.
    await expect(acceptQuote(c.deps(), reference, true)).rejects.toThrow(/can't be accepted/);
    expect(await db.order.count({ where: { organisationId: c.organisationId } })).toBe(1);
  });

  it("can't be accepted once it has expired", async () => {
    const c = await customer("Late Deciders");
    const q = await requestQuote(db, request(), { market: "bw", organisationId: c.organisationId, userId: c.owner.userId });
    await sent(q.reference);
    await db.quote.update({ where: { id: q.id }, data: { validUntil: addDays(today, -1) } });
    expect(quoteState(await db.quote.findUniqueOrThrow({ where: { id: q.id } }), today)).toBe("expired");
    await expect(acceptQuote(c.deps(), q.reference, true)).rejects.toThrow(/expired/);
    expect(await db.order.count({ where: { organisationId: c.organisationId } })).toBe(0);
  });

  it("stops the old link working when staff change a sent quote", async () => {
    const q = await requestQuote(db, request(), { market: "bw" });
    const token = await sent(q.reference);
    const { wasSent } = await saveQuote({ db, staff: admin }, q.reference, draft({ lines: [{ kind: "MONTHLY", description: "Managed link, 200 Mbps", quantity: "1", unitPrice: "6500" }] }));
    expect(wasSent).toBe(true);
    expect(await quoteByToken(db, token)).toBeNull();
    expect((await db.quote.findUniqueOrThrow({ where: { id: q.id } })).status).toBe("NEW");
  });

  it("won't take a quote into an account billed in another currency", async () => {
    const q = await requestQuote(db, request(), { market: "bw" });
    const token = await sent(q.reference);
    const c = await customer("Rand Traders");
    await db.organisation.update({ where: { id: c.organisationId }, data: { billingMarket: "za", currency: "ZAR" } });
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: c.organisationId } });
    await expect(claimQuote(db, token, { actor: c.owner, organisation })).rejects.toThrow(/in BWP.*billed in ZAR/);
  });

  it("can be declined from the link without an account, and closed by staff", async () => {
    const q = await requestQuote(db, request(), { market: "bw" });
    const token = await sent(q.reference);
    await declineQuoteByToken(db, token, "We went with our current provider.");
    expect(await db.quote.findUniqueOrThrow({ where: { id: q.id } })).toMatchObject({ status: "DECLINED", declineReason: "We went with our current provider." });

    const spam = await requestQuote(db, request(), { market: "bw" });
    await expect(closeQuote({ db, staff: admin }, spam.reference, "")).rejects.toThrow(/Say why/);
    await closeQuote({ db, staff: admin }, spam.reference, "Duplicate of an earlier request.");
    expect((await db.quote.findUniqueOrThrow({ where: { id: spam.id } })).status).toBe("CLOSED");
    expect(await db.staffAuditEvent.findFirst({ where: { action: "quote.closed", data: { path: ["quote"], equals: spam.reference } } })).toBeTruthy();
  });
});
