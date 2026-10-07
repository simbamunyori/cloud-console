import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monthOf } from "../src/lib/domain/pricing";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { MemoryEmailAdapter } from "../src/server/email/adapter";
import { deliverDue } from "../src/server/email/outbox";
import { placeOrder, type OrderDeps } from "../src/server/orders/orders";
import { allScores, previousMonth, reportDocument, writeMonthlyReports } from "../src/server/security/reports";
import { fullScore, homeChecks, scoreChecks, type ScoreFacts } from "../src/server/security/score";
import { refreshAllScores, refreshSecurityProfile } from "../src/server/security/score-facts";
import type { EmailCheckLookup } from "../src/server/tools/email-check";
import { db, hasDb, makeOrganisation } from "./helpers";

const NOW = new Date("2026-10-06T08:00:00Z");

const base: ScoreFacts = {
  emailDomain: "acme.co.bw",
  email: {
    provider: "microsoft",
    checks: [
      { key: "mx", status: "pass", title: "Mail servers", finding: "Microsoft 365 receives your email.", fix: "" },
      { key: "spf", status: "pass", title: "SPF", finding: "In place.", fix: "" },
      { key: "dkim", status: "fail", title: "DKIM", finding: "No DKIM signature found.", fix: "Turn on DKIM signing." },
      { key: "dmarc", status: "warn", title: "DMARC", finding: "DMARC only monitors.", fix: "Move to quarantine." },
      { key: "certificate", status: "pass", title: "Website certificate", finding: "Valid.", fix: "" },
    ],
  },
  members: 4,
  withoutTwoStep: 0,
  inactiveMembers: 0,
  admins: 2,
  services: [{ name: "Microsoft 365 Business Standard", kind: "microsoft", backup: null }],
  hasThreatMonitoring: false,
  devices: null,
  workspace: null,
  now: NOW,
};

describe("strategy U4 units", () => {
  it("scores real checks, with a fix and the product that fixes each failure", () => {
    const checks = scoreChecks(base);
    const by = (key: string) => checks.find((c) => c.key === key)!;
    expect(by("email-dkim")).toMatchObject({ status: "fail", explanation: "No DKIM signature found. Turn on DKIM signing.", product: { slug: "managed-support" } });
    expect(by("email-spf").product).toBeUndefined();
    expect(by("backup-0")).toMatchObject({ status: "fail", title: "Microsoft 365 Business Standard isn't backed up", product: { slug: "backup-microsoft-365" } });
    expect(by("monitoring").product).toEqual({ slug: "managed-detection-response" });
    // Nothing connected yet: shown, not counted.
    expect(by("devices").status).toBe("unknown");
    expect(by("workspace").status).toBe("unknown");
    // Got 5+8+0+4+5 email, 20 two-step, 0 backup, 0 monitoring, 8 inactive, 5 admins = 55, of 34+20+20+10+8+5 = 97.
    expect(fullScore(checks)).toBe(Math.round((55 / 97) * 100));
  });

  it("marks stale and failed backups, and asks for a domain when there is none", () => {
    const stale = scoreChecks({ ...base, services: [{ name: "Web hosting", kind: "server", backup: { health: "OK", lastSuccessAt: new Date(NOW.getTime() - 5 * 86_400_000) } }] });
    expect(stale.find((c) => c.key === "backup-0")).toMatchObject({ status: "warn", explanation: "Web hosting's last good copy is 5 days old." });
    const fresh = scoreChecks({ ...base, services: [{ name: "Web hosting", kind: "server", backup: { health: "OK", lastSuccessAt: new Date(NOW.getTime() - 86_400_000) } }] });
    expect(fresh.find((c) => c.key === "backup-0")?.status).toBe("pass");
    const none = scoreChecks({ ...base, emailDomain: null, email: null });
    expect(none.filter((c) => c.group === "email")).toEqual([expect.objectContaining({ key: "email-domain", status: "unknown" })]);
  });

  it("counts devices and workspace settings once they report", () => {
    const checks = scoreChecks({ ...base, devices: { protected: 3, total: 5 }, workspace: { failing: [], total: 6 } });
    expect(checks.find((c) => c.key === "devices")).toMatchObject({ status: "warn", product: { slug: "managed-detection-response", quantity: 2 } });
    expect(checks.find((c) => c.key === "workspace")?.status).toBe("pass");
  });

  it("gives Home each counted check's share of 100", () => {
    const home = homeChecks(scoreChecks(base));
    expect(home.every((c) => c.fix.href)).toBe(true);
    expect(home.some((c) => c.key === "devices")).toBe(false);
    expect(Math.abs(home.reduce((n, c) => n + c.points, 0) - 100)).toBeLessThanOrEqual(3);
  });

  it("reports on the month just ended", () => {
    expect(previousMonth(new Date("2026-11-01T05:00:00Z"))).toBe("2026-10");
    expect(previousMonth(new Date("2027-01-01T05:00:00Z"))).toBe("2026-12");
  });
});

const month = monthOf(new Date());
const lookup: EmailCheckLookup = {
  mx: async () => [{ exchange: "acme.mail.protection.outlook.com", priority: 0 }],
  txt: async (name) => (name.startsWith("_dmarc.") ? ["v=DMARC1; p=reject"] : name.includes("_domainkey") ? [] : ["v=spf1 include:spf.protection.outlook.com -all"]),
  certificate: async () => ({ validTo: new Date(Date.now() + 90 * 86_400_000), issuer: "Let's Encrypt" }),
  expiry: async () => null,
};

describe.skipIf(!hasDb)("strategy U4", () => {
  const stub = new StubBillingAdapter(db);

  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, [month]);
  });
  afterAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: "security-score" } });
  });

  async function customer(name: string, domain: string) {
    const org = await makeOrganisation(name);
    const billing = await scopedBilling(db, stub, org.organisationId);
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    const deps: OrderDeps = { db: org.tenant, billing, organisation, actor: org.owner };
    await placeOrder(deps, { slug: "microsoft-365-business-standard", quantity: 2, options: { domain }, startNow: true });
    return org;
  }

  it("scores an account from its services, team and email domain", async () => {
    const org = await customer("Maun Safaris", "maun-safaris.co.bw");
    const { score, checks } = await refreshSecurityProfile({ db, adapter: stub, lookup, now: new Date() }, org.organisationId);
    const profile = await db.securityProfile.findUniqueOrThrow({ where: { organisationId: org.organisationId } });
    expect(profile).toMatchObject({ score, emailDomain: null });
    expect((profile.emailReport as { domain: string }).domain).toBe("maun-safaris.co.bw");
    expect(checks.find((c) => c.key === "email-dkim")?.status).not.toBe("pass");
    expect(checks.find((c) => c.key === "email-dmarc")?.status).toBe("pass");
    expect(checks.find((c) => c.key === "backup-0")).toMatchObject({ status: "fail", product: { slug: "backup-microsoft-365" } });
    expect(checks.find((c) => c.key === "two-step")?.status).toBe("pass");

    // A backup ordered later counts on the next run.
    const billing = await scopedBilling(db, stub, org.organisationId);
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    await placeOrder({ db: org.tenant, billing, organisation, actor: org.owner }, { slug: "backup-microsoft-365", quantity: 2, options: {}, startNow: true });
    await db.backupProtection.updateMany({ where: { organisationId: org.organisationId }, data: { health: "OK", lastSuccessAt: new Date() } });
    const again = await refreshSecurityProfile({ db, adapter: stub, lookup, now: new Date() }, org.organisationId);
    expect(again.checks.find((c) => c.key === "backup-0")?.status).toBe("pass");
    expect(again.score).toBeGreaterThan(score);
  });

  it("runs nightly only while the feature is on, and staff see the lowest first", async () => {
    await db.featureSwitch.deleteMany({ where: { key: "security-score" } });
    expect(await refreshAllScores({ db, adapter: stub, lookup })).toBe(0);
    const org = await customer("Kasane Kayaks", "kasane-kayaks.co.bw");
    await db.securityProfile.upsert({ where: { organisationId: org.organisationId }, create: { organisationId: org.organisationId, emailDomain: "kasane-kayaks.co.bw" }, update: {} });
    await db.featureSwitch.create({ data: { key: "security-score", enabled: true } });
    expect(await refreshAllScores({ db, adapter: stub, lookup })).toBeGreaterThan(0);
    const rows = await allScores(db);
    const scored = rows.filter((r) => r.score !== null).map((r) => r.score!);
    expect(scored).toEqual([...scored].sort((a, b) => a - b));
    expect(rows.find((r) => r.organisation.id === org.organisationId)).toMatchObject({ emailDomain: "kasane-kayaks.co.bw" });
  }, 180_000);

  it("writes each monthly report once and emails it to owners and admins as a PDF", async () => {
    await db.featureSwitch.upsert({ where: { key: "security-score" }, create: { key: "security-score", enabled: true }, update: { enabled: true } });
    const org = await customer("Ghanzi Grain", "ghanzi-grain.co.bw");
    await refreshSecurityProfile({ db, adapter: stub, lookup }, org.organisationId);
    const at = new Date("2026-11-01T05:00:00Z");
    // Only this organisation is new for 2026-10 in this run; others may have reports already.
    await writeMonthlyReports(db, at);
    const report = await db.securityReport.findUniqueOrThrow({ where: { organisationId_month: { organisationId: org.organisationId, month: "2026-10" } } });
    expect(report.emailedAt).toEqual(at);
    expect((await writeMonthlyReports(db, at)).written).toBe(0);

    const doc = await reportDocument(db, report, "Ghanzi Grain", "https://console.example");
    expect(doc).toMatchObject({ kind: "Security report", number: "October 2026" });
    expect(doc.lines[0].amount).toBe("Fix this");

    const adapter = new MemoryEmailAdapter();
    await deliverDue(db, adapter, new Date(), 50, { toAddress: org.email });
    const sent = adapter.sent.find((m) => m.subject.startsWith("Ghanzi Grain's security report for October 2026"));
    expect(sent?.attachments?.[0]).toMatchObject({ filename: "security-report-2026-10.pdf", contentType: "application/pdf" });
    expect(sent!.attachments![0].content.subarray(0, 4).toString()).toBe("%PDF");
  }, 180_000);
});
