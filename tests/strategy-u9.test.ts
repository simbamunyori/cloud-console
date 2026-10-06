import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { money } from "../src/lib/domain/money";
import type { BillingAdapter, Transaction } from "../src/server/billing/adapter";
import { TEMPLATES } from "../src/server/email/templates";
import { setFeature } from "../src/server/features/features";
import { activePartnerByCode, applyAsPartner, attributeSignUp, decideApplication, partnerDashboard, payoutDetailsFor, recordPayout, saveReferralSettings, savePayoutDetails, updatePartner, writeStatements } from "../src/server/referrals/referrals";
import type { StaffActor } from "../src/server/staff/access";
import { checkEmailSecurity, type EmailCheckLookup } from "../src/server/tools/email-check";
import { purgeSharedResults, shareEmailReport, sharedEmailReport, startScoreFromFreeCheck } from "../src/server/tools/results";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

// Payout details are sealed with the partner vault's key, from TOTP_ENCRYPTION_KEY.
const TOTP = process.env.TOTP_ENCRYPTION_KEY;
beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
});
afterAll(() => {
  if (TOTP === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = TOTP;
});

const lookup: EmailCheckLookup = {
  mx: async () => [{ exchange: "acme.mail.protection.outlook.com", priority: 0 }],
  txt: async (name) => (name.startsWith("_dmarc.") ? [] : name.includes("_domainkey") ? [] : ["v=spf1 include:spf.protection.outlook.com -all"]),
  certificate: async () => ({ validTo: new Date(Date.now() + 90 * 86_400_000), issuer: "Let's Encrypt" }),
  expiry: async () => null,
};

const NOW = new Date(Date.UTC(2018, 7, 3, 6, 30));
const FEATURES = ["free-tool-results", "referral-partners"];

describe.skipIf(!hasDb)("strategy U9", () => {
  let admin: StaffActor;
  let support: StaffActor;
  let finance: StaffActor;

  beforeAll(async () => {
    admin = await staff("ADMIN");
    support = await staff("SUPPORT");
    finance = await staff("FINANCE");
    await db.featureSwitch.deleteMany({ where: { key: { in: FEATURES } } });
    await db.referralSettings.deleteMany({});
  });
  afterAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: { in: FEATURES } } });
    await db.referralSettings.deleteMany({});
  });

  it("shares a report only when asked, and only for 90 days", async () => {
    const report = await checkEmailSecurity("acme.co.bw", lookup, NOW);
    await expect(shareEmailReport(db, report, true, NOW)).rejects.toThrow();
    await setFeature({ db, staff: admin }, "free-tool-results", true);
    expect(await shareEmailReport(db, report, false, NOW)).toBeNull();
    const token = (await shareEmailReport(db, report, true, NOW))!;
    const shown = await sharedEmailReport(db, token, new Date(NOW.getTime() + 86_400_000));
    expect(shown).toMatchObject({ domain: "acme.co.bw", score: report.score });
    expect((await db.sharedResult.findUniqueOrThrow({ where: { token } })).views).toBe(1);
    expect(await sharedEmailReport(db, token, new Date(NOW.getTime() + 91 * 86_400_000))).toBeNull();
    expect(await sharedEmailReport(db, "nope")).toBeNull();
    expect(await purgeSharedResults(db, new Date(NOW.getTime() + 91 * 86_400_000))).toBeGreaterThanOrEqual(1);
    expect(await db.sharedResult.findUnique({ where: { token } })).toBeNull();
  });

  it("starts a new customer's score from the email check they emailed themselves", async () => {
    const org = await makeOrganisation("Molepolole Mills");
    const report = await checkEmailSecurity("molepolole-mills.co.bw", lookup, NOW);
    await db.lead.create({
      data: {
        reference: `L-${uniqueEmail("l").slice(0, 10)}`,
        market: "bw",
        source: "EMAIL_CHECK",
        tool: "email-check",
        name: "Neo",
        email: org.email,
        need: "Email check",
        consentText: "Yes",
        consentAt: NOW,
        purgeAfter: new Date(Date.UTC(2030, 0, 1)),
        toolResult: { domain: report.domain, score: report.score, checks: report.checks } as object,
      },
    });
    const started = await startScoreFromFreeCheck(db, org.organisationId, org.email.toUpperCase(), NOW);
    expect(started?.domain).toBe("molepolole-mills.co.bw");
    const profile = await db.securityProfile.findUniqueOrThrow({ where: { organisationId: org.organisationId } });
    expect(profile).toMatchObject({ emailDomain: "molepolole-mills.co.bw", score: started!.score });
    expect(profile.startedFrom).toMatch(/^email-check:L-/);
    expect((profile.checks as unknown[]).length).toBeGreaterThan(0);
    // Once there's a report, it's left alone.
    expect(await startScoreFromFreeCheck(db, org.organisationId, org.email, NOW)).toBeNull();
    const other = await makeOrganisation("Kasane Kayaks");
    expect(await startScoreFromFreeCheck(db, other.organisationId, other.email, NOW)).toBeNull();
  });

  it("runs referral partners from application to paid commission", async () => {
    const input = { name: "Kgosi Moyo", company: `Moyo & Co Accountants ${uniqueEmail("x").slice(0, 6)}`, email: uniqueEmail("partner"), phone: "", kind: "ACCOUNTANT", market: "bw", consent: true };
    await expect(applyAsPartner(db, input)).rejects.toMatchObject({ code: "not-found" });
    await setFeature({ db, staff: admin }, "referral-partners", true);
    await expect(applyAsPartner(db, { ...input, email: "nope", kind: "SPY", consent: false })).rejects.toMatchObject({ fieldErrors: { email: expect.any(String), kind: expect.any(String), consent: expect.any(String) } });
    const p = await applyAsPartner(db, input);
    expect(await db.outboundEmail.count({ where: { kind: "referral.received", toAddress: input.email } })).toBe(1);
    expect(await db.outboundEmail.count({ where: { kind: "referral.applied", payload: { path: ["partnerId"], equals: p.id } } })).toBeGreaterThanOrEqual(1);
    await expect(applyAsPartner(db, input)).rejects.toMatchObject({ code: "conflict" });

    await expect(decideApplication({ db, staff: support }, p.id, { decision: "approve", commission: "" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(decideApplication({ db, staff: admin }, p.id, { decision: "approve", commission: "80" })).rejects.toMatchObject({ code: "invalid" });
    await saveReferralSettings({ db, staff: admin }, { commission: "10" });
    await decideApplication({ db, staff: admin }, p.id, { decision: "approve", commission: "12.5" });
    const approved = await db.referralPartner.findUniqueOrThrow({ where: { id: p.id } });
    expect(approved).toMatchObject({ status: "ACTIVE", commissionBps: 1250 });
    expect(approved.code).toMatch(/^moyo-co-accountants/);
    const welcome = await TEMPLATES["referral.approved"]({ partnerId: p.id }, { db, appUrl: "https://console.example", siteUrl: "https://www.example", consoleName: "Cloud Console", now: NOW, locale: "en-BW", timeZone: "Africa/Gaborone" });
    expect(JSON.stringify(welcome)).toContain(`https://www.example/bw?ref=${approved.code}`);
    expect(JSON.stringify(welcome)).toContain(`/bw/referral-partners/${approved.dashboardToken}`);

    // A customer through the link counts as theirs; a paused partner's link doesn't count.
    const customer = await makeOrganisation("Mahalapye Motors");
    expect(await attributeSignUp(db, customer.organisationId, approved.code!.toUpperCase())).toMatchObject({ partnerId: p.id });
    expect(await attributeSignUp(db, customer.organisationId, "nobody-here")).toBeNull();
    await updatePartner({ db, staff: admin }, p.id, { status: "PAUSED", commission: "12.5" });
    expect(await activePartnerByCode(db, approved.code!)).toBeNull();
    await updatePartner({ db, staff: admin }, p.id, { status: "ACTIVE", commission: "12.5" });

    // Last month's statement from what the customer paid us.
    const client = uniqueEmail("client");
    await db.billingAccount.create({ data: { organisationId: customer.organisationId, provider: "WHMCS", externalClientId: client } });
    const pay = (day: number, minor: bigint, currency = "BWP"): Transaction => ({ transactionId: uniqueEmail("t"), date: new Date(Date.UTC(2018, 6, day)), gateway: "banktransfer", reference: "x", amountIn: money(minor, currency), amountOut: money(0n, currency), description: "" });
    const adapter = { provider: "WHMCS", listTransactions: async (c: string) => (c === client ? [pay(5, 100000n), pay(20, 60000n), pay(21, 500n, "JPY"), { ...pay(22, 0n), amountOut: money(1000n, "BWP") }] : []) } as unknown as BillingAdapter;
    expect(await writeStatements(db, adapter, NOW)).toBeGreaterThanOrEqual(1);
    const st = await db.referralStatement.findUniqueOrThrow({ where: { partnerId_month: { partnerId: p.id, month: "2018-07" } } });
    expect(st).toMatchObject({ paidInMinor: 160000n, rateBps: 1250, commissionMinor: 20000n, status: "DUE" });
    expect(st.lines).toEqual([{ organisation: "Mahalapye Motors", paidInMinor: "160000", skipped: 1 }]);
    await writeStatements(db, adapter, NOW);
    expect(await db.referralStatement.count({ where: { partnerId: p.id } })).toBe(1);

    // The partner adds bank details on their dashboard; Finance pays and records it.
    const dash = await partnerDashboard(db, approved.dashboardToken!);
    expect(dash?.customers).toEqual([{ name: "Mahalapye Motors", since: expect.any(Date) }]);
    await expect(savePayoutDetails(db, approved.dashboardToken!, "short")).rejects.toMatchObject({ code: "invalid" });
    await savePayoutDetails(db, approved.dashboardToken!, "First National Bank, Main Mall, Moyo & Co, 62000000000");
    const sealed = (await db.referralPartner.findUniqueOrThrow({ where: { id: p.id } })).payoutDetails;
    expect(sealed).not.toContain("62000000000");
    expect(payoutDetailsFor(sealed)).toContain("62000000000");
    await expect(recordPayout({ db, staff: support }, st.id, "EFT-1")).rejects.toMatchObject({ code: "forbidden" });
    await recordPayout({ db, staff: finance }, st.id, "EFT-1");
    expect(await db.referralStatement.findUniqueOrThrow({ where: { id: st.id } })).toMatchObject({ status: "PAID", paymentRef: "EFT-1" });
    await expect(recordPayout({ db, staff: finance }, st.id, "EFT-2")).rejects.toMatchObject({ code: "conflict" });
    expect(await db.outboundEmail.count({ where: { kind: "referral.paid", toAddress: input.email } })).toBe(1);
    await db.billingAccount.deleteMany({ where: { externalClientId: client } });
  });
});

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("u9"), name: `Lorato ${role}`, passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}
