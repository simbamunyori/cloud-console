import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthError, signUp } from "../src/server/auth/service";
import { ensureBillingAccount } from "../src/server/billing/accounts";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { setDefaultMarket, setMarketEnabled, updateMarketSettings, type MarketSettingsInput } from "../src/server/markets/markets";
import { changeOrganisationMarket } from "../src/server/markets/organisation-market";
import { joinWaitlist, markContacted, waitlist } from "../src/server/markets/waitlist";
import type { StaffActor } from "../src/server/staff/access";
import { db, hasDb, makeOrganisation, PASSWORD, testDeps, uniqueEmail } from "./helpers";

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Kagiso Staff", passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

/** Test markets use Antarctica and Bouvet Island, which no real market serves. */
const PREFIX = "test-";
async function clearTestMarkets() {
  const old = await db.market.findMany({ where: { code: { startsWith: PREFIX } } });
  const codes = old.map((m) => m.code);
  await db.organisation.updateMany({ where: { billingMarket: { in: codes } }, data: { billingMarket: "bw", currency: "BWP" } });
  await db.marketChange.deleteMany({ where: { marketCode: { in: codes } } });
  await db.market.deleteMany({ where: { code: { in: codes } } });
}

function settings(overrides: Partial<MarketSettingsInput> = {}): MarketSettingsInput {
  return {
    name: "Antarctica",
    countries: "AQ",
    currency: "USD",
    locale: "en-US",
    timeZone: "UTC",
    taxEnabled: false,
    taxRatePercent: "0",
    taxDisplay: "EXCLUSIVE",
    taxLabel: "Tax",
    taxRegistrationNumber: "",
    companyRegistrationNumber: "",
    registeredAddress: "",
    ownDataCentre: false,
    paymentMethods: ["card"],
    eftBankName: "",
    eftAccountName: "",
    eftAccountNumber: "",
    eftBranchCode: "",
    eftSwiftCode: "",
    supportEmail: "help@example.com",
    supportPhone: "",
    supportHours: "Weekdays",
    highlightedTlds: ".com",
    dataProtectionLaw: "",
    ...overrides,
  };
}

describe.skipIf(!hasDb)("markets", () => {
  let admin: StaffActor;
  let code: string;

  beforeAll(async () => {
    await clearTestMarkets();
    admin = await staff("ADMIN");
    code = `${PREFIX}${Date.now().toString(36)}`;
    await db.market.create({
      data: { code, name: "Antarctica", countries: ["AQ"], currency: "USD", locale: "en-US", timeZone: "UTC", enabled: false, sortOrder: 99, taxLabel: "Tax", paymentMethods: ["card"], supportEmail: "help@example.com", supportHours: "Weekdays", highlightedTlds: [".com"] },
    });
  });
  afterAll(clearTestMarkets);

  it("doesn't open an account for a country without a market that is on", async () => {
    const email = uniqueEmail("far-away");
    await expect(signUp(testDeps(), { organisationName: "Penguin Logistics", name: "Ada Frost", email, password: PASSWORD, country: "AQ" })).rejects.toMatchObject({
      code: "no-market",
    });
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it("opens the account in the country's market, with its currency, once the market is on", async () => {
    await setMarketEnabled({ db, staff: admin }, code, true);
    const { organisationId } = await signUp(testDeps(), { organisationName: "Penguin Logistics", name: "Ada Frost", email: uniqueEmail("south"), password: PASSWORD, country: "aq" });
    const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId } });
    expect(org).toMatchObject({ billingMarket: code, currency: "USD", country: "AQ", timeZone: "UTC" });
  });

  it("keeps a Botswana sign-up in the Botswana market and currency", async () => {
    const { organisationId } = await signUp(testDeps(), { organisationName: "Gaborone Grain", name: "Neo Kgosi", email: uniqueEmail("bw"), password: PASSWORD, country: "BW" });
    expect(await db.organisation.findUniqueOrThrow({ where: { id: organisationId } })).toMatchObject({ billingMarket: "bw", currency: "BWP" });
  });

  it("lets only admins change market settings, and logs every changed field", async () => {
    const support = await staff("SUPPORT");
    await expect(updateMarketSettings({ db, staff: support }, code, settings())).rejects.toMatchObject({ code: "forbidden" });

    const changed = await updateMarketSettings({ db, staff: admin }, code, settings({ taxEnabled: true, taxRatePercent: "15.5", supportPhone: "+1 555 0100", countries: "AQ, bv" }));
    expect(changed.sort()).toEqual(["countries", "supportPhone", "taxEnabled", "taxRateBps"]);
    const m = await db.market.findUniqueOrThrow({ where: { code } });
    expect(m).toMatchObject({ taxEnabled: true, taxRateBps: 1550, countries: ["AQ", "BV"], supportPhone: "+1 555 0100" });
    const log = await db.marketChange.findMany({ where: { marketCode: code, userId: admin.userId } });
    expect(log.find((c) => c.field === "taxRateBps")).toMatchObject({ fromValue: "0", toValue: "1550" });
  });

  it("refuses settings that would break billing", async () => {
    const deps = { db, staff: admin };
    await expect(updateMarketSettings(deps, code, settings({ currency: "ZAR" }))).rejects.toMatchObject({ fieldErrors: { currency: expect.any(String) } });
    await expect(updateMarketSettings(deps, code, settings({ countries: "AQ, BW" }))).rejects.toMatchObject({ fieldErrors: { countries: "BW already belongs to another market." } });
    await expect(updateMarketSettings(deps, code, settings({ paymentMethods: ["eft"] }))).rejects.toMatchObject({ fieldErrors: { eftBankName: expect.any(String) } });
    await expect(updateMarketSettings(deps, code, settings({ locale: "not a locale" }))).rejects.toMatchObject({ fieldErrors: { locale: expect.any(String) } });
  });

  it("keeps the default market on", async () => {
    await expect(setMarketEnabled({ db, staff: admin }, "bw", false)).rejects.toMatchObject({ code: "invalid" });
    await expect(setDefaultMarket({ db, staff: admin }, "za")).rejects.toMatchObject({ code: "invalid" });
  });

  it("moves a customer to another market with the same currency, and tells them", async () => {
    const zw = await db.market.findUniqueOrThrow({ where: { code: "zw" } });
    expect(zw.currency).toBe("USD");
    const { organisationId } = await signUp(testDeps(), { organisationName: "Ice Shelf Trading", name: "Ada Frost", email: uniqueEmail("move"), password: PASSWORD, country: "AQ" });
    await changeOrganisationMarket({ db, adapter: new StubBillingAdapter(db), staff: admin }, organisationId, "zw");
    expect(await db.organisation.findUniqueOrThrow({ where: { id: organisationId } })).toMatchObject({ billingMarket: "zw", currency: "USD", timeZone: "Africa/Harare" });
    const event = await db.auditEvent.findFirstOrThrow({ where: { organisationId, action: "organisation.market_changed" } });
    expect(event).toMatchObject({ actorKind: "STAFF", visibleToCustomer: true });
  });

  it("changes a customer's currency only before their first invoice", async () => {
    const stub = new StubBillingAdapter(db);
    const fresh = await makeOrganisation("Fresh Start Farms");
    await ensureBillingAccount(db, stub, fresh.organisationId);
    await changeOrganisationMarket({ db, adapter: stub, staff: admin }, fresh.organisationId, code);
    const account = await db.billingAccount.findUniqueOrThrow({ where: { organisationId: fresh.organisationId } });
    expect((await stub.getClient(account.externalClientId))?.currency).toBe("USD");

    const billed = await makeOrganisation("Billed Before Ltd");
    await ensureBillingAccount(db, stub, billed.organisationId);
    const billedAccount = await db.billingAccount.findUniqueOrThrow({ where: { organisationId: billed.organisationId } });
    await db.stubInvoice.create({ data: { clientId: Number(billedAccount.externalClientId), invoiceNum: `T-${Date.now()}`, date: new Date(), dueDate: new Date(), status: "Paid", currency: "BWP", subtotal: 100n, tax: 0n, total: 100n } });
    await expect(changeOrganisationMarket({ db, adapter: stub, staff: admin }, billed.organisationId, code)).rejects.toMatchObject({ field: "market" });
    expect(await db.organisation.findUniqueOrThrow({ where: { id: billed.organisationId } })).toMatchObject({ billingMarket: "bw", currency: "BWP" });
  });

  it("keeps one waiting list entry per person and country, for staff", async () => {
    const email = uniqueEmail("wait");
    await expect(joinWaitlist(db, { name: "", email: "nope", country: "XX" })).rejects.toMatchObject({ fieldErrors: { name: expect.any(String), email: expect.any(String), country: expect.any(String) } });
    await joinWaitlist(db, { name: "Kofi Mensah", email, country: "gh", company: "Accra Freight" });
    await joinWaitlist(db, { name: "Kofi Mensah", email: email.toUpperCase(), country: "GH", message: "Microsoft 365 for 40 people" });
    const entries = await db.waitlistEntry.findMany({ where: { email } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ country: "GH", message: "Microsoft 365 for 40 people" });

    await expect(waitlist(db, { userId: "x", name: "x", staffRole: "SUPPORT" })).resolves.toBeInstanceOf(Array);
    await markContacted(db, admin, entries[0].id);
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: entries[0].id } })).toMatchObject({ contactedBy: admin.name });
  });

  it("is an AuthError the sign-up page can show", () => {
    expect(new AuthError("no-market", "x").code).toBe("no-market");
  });
});
