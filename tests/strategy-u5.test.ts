import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monthOf } from "../src/lib/domain/pricing";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { setFeature } from "../src/server/features/features";
import { placeOrder, type OrderDeps } from "../src/server/orders/orders";
import { scoreFacts } from "../src/server/security/score-facts";
import { ManualSecurityProvider, parseDevice, parseIncident, SecurityProviderError, signWebhook, verifyWebhook, WebhookSecurityProvider, type SecurityProviderAdapter } from "../src/server/soc/provider";
import { providerList, saveProvider, setProviderActive, testProvider } from "../src/server/soc/providers";
import { createIncident, customerIncident, customerSecurity, escalateLate, receiveWebhook, registerInterest, saveSocSettings, socQueue, syncSoc, updateIncident } from "../src/server/soc/soc";
import type { StaffActor } from "../src/server/staff/access";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

// The partner vault's key comes from TOTP_ENCRYPTION_KEY, which the check job doesn't set.
const TOTP = process.env.TOTP_ENCRYPTION_KEY;
beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
});
afterAll(() => {
  if (TOTP === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = TOTP;
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("strategy U5 units", () => {
  it("checks webhook signatures and age", () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const ts = String(Math.floor(now.getTime() / 1000));
    const body = '{"id":"e1"}';
    const sig = signWebhook("s3cret", ts, body);
    expect(verifyWebhook("s3cret", { signature: sig, timestamp: ts }, body, now)).toBeNull();
    expect(verifyWebhook("s3cret", { signature: `sha256=${sig}`, timestamp: ts }, body, now)).toBeNull();
    expect(verifyWebhook("other", { signature: sig, timestamp: ts }, body, now)).toBe("Bad signature.");
    expect(verifyWebhook("s3cret", { signature: sig, timestamp: ts }, '{"id":"e2"}', now)).toBe("Bad signature.");
    expect(verifyWebhook("s3cret", { signature: sig, timestamp: ts }, body, new Date(now.getTime() + 6 * 60_000))).toBe("Too old.");
    expect(verifyWebhook("s3cret", { signature: null, timestamp: ts }, body, now)).toBe("Missing signature.");
    expect(verifyWebhook("s3cret", { signature: "zz", timestamp: ts }, body, now)).toBe("Bad signature.");
  });

  it("reads incidents and devices from the generic contract", () => {
    expect(parseIncident({ id: "a1", tenant: "t1", title: "Ransomware blocked", severity: "Critical", device: "LAPTOP-7" })).toEqual({
      ref: "a1",
      tenantRef: "t1",
      title: "Ransomware blocked",
      summary: "Ransomware blocked",
      severity: "CRITICAL",
      deviceName: "LAPTOP-7",
      resolved: false,
    });
    expect(parseIncident({ id: "a2", tenant: "t1", title: "x", severity: "weird", status: "resolved" })).toMatchObject({ severity: "MEDIUM", resolved: true });
    expect(parseIncident({ id: "a3", title: "no tenant" })).toBeNull();
    expect(parseDevice({ id: "d1", name: "Front desk", health: "ok", lastSeenAt: "2026-10-06T08:00:00Z" })).toMatchObject({ ref: "d1", health: "HEALTHY", os: null });
    expect(parseDevice({ id: "d2", health: "???" })).toMatchObject({ name: "d2", health: "AT_RISK", lastSeenAt: null });
    expect(parseDevice({})).toBeNull();
  });

  it("speaks the generic API with the saved headers", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/v1/ping")) return json(200, { account: "Fourth Generation Technologies" });
      if (url.endsWith("/v1/tenants")) return json(201, { id: "ten-1" });
      if (url.endsWith("/enrolment")) return json(200, { link: "http://insecure.example/agent", note: "x" });
      if (url.includes("/devices")) return json(200, { devices: [{ id: "d1", name: "PC-1", health: "healthy" }, { nope: true }] });
      if (url.includes("/reports/")) return new Response(null, { status: 404 });
      return json(401, {});
    }) as typeof fetch;
    const p = new WebhookSecurityProvider({ endpoint: "https://soc.example/", apiKey: "k", apiSecret: "s", custom: { Region: "af-south-1" } }, fetcher);
    expect(await p.test()).toBe("Signed in as Fourth Generation Technologies.");
    expect(calls[0].url).toBe("https://soc.example/v1/ping");
    expect(calls[0].init.headers).toMatchObject({ authorization: "Bearer k", "x-api-secret": "s", "x-region": "af-south-1" });
    expect(await p.createTenant({ organisationName: "Acme", reference: "acme" })).toEqual({ tenantRef: "ten-1" });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ name: "Acme", reference: "acme" });
    // Only https links reach customers.
    expect(await p.enrolment("ten-1")).toBeNull();
    expect(await p.devices("ten-1")).toEqual([expect.objectContaining({ ref: "d1", health: "HEALTHY" })]);
    expect(await p.report("ten-1", "2026-09")).toBeNull();
    await expect(p.incidentsSince(new Date())).rejects.toBeInstanceOf(SecurityProviderError);
    expect(await new ManualSecurityProvider().createTenant()).toBeNull();
  });
});

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("soc"), name: `Lesedi ${role}`, passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

const month = monthOf(new Date());
const SECRET = "whsec-test-123";

function signed(body: unknown, at = new Date()) {
  const text = JSON.stringify(body);
  const timestamp = String(Math.floor(at.getTime() / 1000));
  return { headers: { signature: signWebhook(SECRET, timestamp, text), timestamp }, text };
}

describe.skipIf(!hasDb)("strategy U5", () => {
  const stub = new StubBillingAdapter(db);
  let admin: StaffActor;
  let support: StaffActor;
  let providerId: string;

  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, [month]);
    // Providers are global; start from none so "one active" holds.
    await db.securityIncidentEvent.deleteMany({});
    await db.securityIncident.deleteMany({});
    await db.securityDevice.deleteMany({});
    await db.securityTenant.deleteMany({});
    await db.securityWebhookEvent.deleteMany({});
    await db.securityProvider.deleteMany({});
    await db.featureSwitch.deleteMany({ where: { key: "managed-security" } });
    admin = await staff("ADMIN");
    support = await staff("SUPPORT");
  }, 180_000);
  afterAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: "managed-security" } });
    await db.securityProvider.updateMany({ data: { active: false } });
  });

  it("sets up a provider in admin: secrets sealed, a passing test before it is active, and the feature waits for it", async () => {
    const input = { type: "WEBHOOK", name: "Partner SOC", endpoint: "", tenantSettings: "region=af-south-1", customFields: "", apiKey: "", apiSecret: "", webhookSecret: "" };
    await expect(saveProvider({ db, staff: support }, null, input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveProvider({ db, staff: admin }, null, input)).rejects.toMatchObject({ fieldErrors: { endpoint: expect.any(String), apiKey: expect.any(String), webhookSecret: expect.any(String) } });
    await expect(saveProvider({ db, staff: admin }, null, { ...input, endpoint: "http://soc.example", apiKey: "k", webhookSecret: SECRET })).rejects.toMatchObject({ fieldErrors: { endpoint: expect.any(String) } });
    const saved = await saveProvider({ db, staff: admin }, null, { ...input, endpoint: "https://soc.example", apiKey: "key-1", webhookSecret: SECRET });
    providerId = saved.id;
    expect(saved.secrets).not.toContain("key-1");
    const [listed] = (await providerList(db)).filter((p) => p.id === providerId);
    expect(listed).toMatchObject({ secretsSet: { apiKey: true, apiSecret: false, webhookSecret: true }, tenantSettings: "region=af-south-1", active: false });
    expect(JSON.stringify(listed)).not.toContain("key-1");

    await expect(setFeature({ db, staff: admin }, "managed-security", true)).rejects.toMatchObject({ code: "conflict" });
    await expect(setProviderActive({ db, staff: admin }, providerId, true)).rejects.toMatchObject({ code: "conflict" });
    const failing = await testProvider({ db, staff: admin, build: () => ({ test: async () => Promise.reject(new SecurityProviderError("The security provider refused the API key.")) }) }, providerId);
    expect(failing).toEqual({ ok: false, message: "The security provider refused the API key." });
    expect(await testProvider({ db, staff: admin, build: () => ({ test: async () => "Signed in." }) }, providerId)).toEqual({ ok: true, message: "Signed in." });
    await setProviderActive({ db, staff: admin }, providerId, true);
    await setFeature({ db, staff: admin }, "managed-security", true);
    expect((await db.featureSwitch.findUniqueOrThrow({ where: { key: "managed-security" } })).enabled).toBe(true);
    expect(await db.staffAuditEvent.count({ where: { actorUserId: admin.userId, action: { startsWith: "security-provider." } } })).toBeGreaterThanOrEqual(4);

    // New keys switch it off until a new test passes; leaving a secret empty keeps it.
    await saveProvider({ db, staff: admin }, providerId, { ...input, endpoint: "https://soc.example", apiKey: "key-2" });
    expect(await db.securityProvider.findUniqueOrThrow({ where: { id: providerId } })).toMatchObject({ active: false, lastTestOk: null });
    expect((await db.featureSwitch.findUniqueOrThrow({ where: { key: "managed-security" } })).enabled).toBe(false);
    expect((await providerList(db)).find((p) => p.id === providerId)?.secretsSet.webhookSecret).toBe(true);
    await testProvider({ db, staff: admin, build: () => ({ test: async () => "Signed in." }) }, providerId);
    await setProviderActive({ db, staff: admin }, providerId, true);
    await setFeature({ db, staff: admin }, "managed-security", true);
  });

  async function subscriber(name: string) {
    const org = await makeOrganisation(name);
    const billing = await scopedBilling(db, stub, org.organisationId);
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    const deps: OrderDeps = { db: org.tenant, billing, organisation, actor: org.owner };
    await placeOrder(deps, { slug: "managed-detection-response", quantity: 3, options: {}, startNow: true });
    return org;
  }

  it("starts a tenant on order, then the sync creates it, fetches the install link, devices and reports", async () => {
    const org = await subscriber("Serowe Seeds");
    expect(await db.securityTenant.findUniqueOrThrow({ where: { organisationId: org.organisationId } })).toMatchObject({ providerId, status: "PENDING", tenantRef: null });
    const adapter: SecurityProviderAdapter = {
      kind: "webhook",
      suspendTenant: async () => true,
      removeTenant: async () => true,
      test: async () => "ok",
      createTenant: async () => ({ tenantRef: `ten-${org.organisationId}` }),
      enrolment: async () => ({ link: "https://agent.example/install?t=1", note: "Run it as an administrator." }),
      devices: async () => [
        { ref: "d1", name: "Reception PC", os: "Windows 11", health: "HEALTHY", lastSeenAt: new Date() },
        { ref: "d2", name: "Owner laptop", os: "macOS", health: "UNPROTECTED", lastSeenAt: null },
      ],
      report: async (_ref, m) => ({ month: m, title: `Security report ${m}`, summary: "All quiet.", url: "https://reports.example/1" }),
      incidentsSince: async () => [],
    };
    await syncSoc({ db, adapter, now: new Date("2026-11-02T06:00:00Z") });
    const sec = await customerSecurity(org.tenant);
    expect(sec.tenant).toMatchObject({ status: "ACTIVE", enrolmentLink: "https://agent.example/install?t=1" });
    expect(sec.devices.map((d) => d.name)).toEqual(["Owner laptop", "Reception PC"]);
    expect(sec.reports).toEqual([expect.objectContaining({ month: "2026-10", title: "Security report 2026-10" })]);
    // Nothing about the provider reaches the customer.
    expect(JSON.stringify(sec)).not.toMatch(/Partner SOC|ten-|providerRef|tenantRef/);
    // Devices count in the security score.
    const facts = await scoreFacts(db, org.organisationId, { services: [], emailDomain: null, email: null, now: new Date() });
    expect(facts.devices).toEqual({ protected: 1, total: 2 });

    // A second run doesn't duplicate anything.
    await syncSoc({ db, adapter, now: new Date("2026-11-02T06:05:00Z") });
    expect(await db.securityDevice.count({ where: { organisationId: org.organisationId } })).toBe(2);
    expect(await db.socReport.count({ where: { organisationId: org.organisationId } })).toBe(1);
  }, 180_000);

  it("takes signed webhooks once, opens incidents and emails the customer, and closes them when the provider does", async () => {
    const org = await subscriber("Palapye Packaging");
    await db.securityTenant.update({ where: { organisationId: org.organisationId }, data: { tenantRef: "ten-palapye", status: "ACTIVE" } });
    const event = { id: `evt-${org.organisationId}`, type: "incident", data: { id: `alert-${org.organisationId}`, tenant: "ten-palapye", title: "Suspicious sign-in blocked", summary: "A sign-in from an unusual country was blocked.", severity: "high", device: "PC-3" } };
    const { headers, text } = signed(event);
    expect(await receiveWebhook(db, providerId, { ...headers, signature: "00" }, text)).toMatchObject({ status: 401 });
    expect(await receiveWebhook(db, "nope", headers, text)).toMatchObject({ status: 404 });
    expect(await receiveWebhook(db, providerId, headers, text)).toMatchObject({ status: 200 });
    expect(await receiveWebhook(db, providerId, headers, text)).toMatchObject({ status: 409 });
    const incident = await db.securityIncident.findFirstOrThrow({ where: { organisationId: org.organisationId } });
    expect(incident).toMatchObject({ severity: "HIGH", status: "NEW", deviceName: "PC-3" });
    expect(incident.reference).toMatch(/^SEC-/);
    expect(await db.outboundEmail.count({ where: { organisationId: org.organisationId, kind: "soc.incident" } })).toBe(1);
    expect((await socQueue(db)).some((i) => i.id === incident.id)).toBe(true);

    // The provider resolves it under a new event id.
    const resolved = signed({ ...event, id: `${event.id}-2`, data: { ...event.data, status: "resolved" } });
    expect(await receiveWebhook(db, providerId, resolved.headers, resolved.text)).toMatchObject({ status: 202 });
    expect((await db.securityIncident.findUniqueOrThrow({ where: { id: incident.id } })).status).toBe("RESOLVED");

    const devices = signed({ id: `dev-${org.organisationId}`, type: "devices", data: { tenant: "ten-palapye", devices: [{ id: "x1", name: "Till", health: "offline" }] } });
    expect(await receiveWebhook(db, providerId, devices.headers, devices.text)).toMatchObject({ status: 200 });
    expect(await db.securityDevice.findFirstOrThrow({ where: { organisationId: org.organisationId } })).toMatchObject({ name: "Till", health: "OFFLINE" });
  }, 180_000);

  it("lets staff work an incident: visible actions, internal notes, assignment and escalation when late", async () => {
    const org = await makeOrganisation("Lobatse Leather");
    await expect(saveSocSettings({ db, staff: support }, { critical: "15", high: "60", medium: "240", low: "1440", escalationEmail: "" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveSocSettings({ db, staff: admin }, { critical: "90", high: "60", medium: "240", low: "1440", escalationEmail: "nope" })).rejects.toMatchObject({ fieldErrors: { critical: expect.any(String), escalationEmail: expect.any(String) } });
    await saveSocSettings({ db, staff: admin }, { critical: "15", high: "60", medium: "240", low: "1440", escalationEmail: "soc-escalations@example.com" });

    const opened = new Date("2026-10-06T09:00:00Z");
    const incident = await createIncident({ db, staff: support, now: opened }, { organisationId: org.organisationId, title: "Customer reports a phishing email", summary: "Finance received an invoice from a look-alike domain.", severity: "LOW", deviceName: "" });
    expect(incident.respondBy).toEqual(new Date(opened.getTime() + 1440 * 60_000));
    await updateIncident({ db, staff: support }, incident.id, { status: "INVESTIGATING", ourAction: "We blocked the sender for everyone.", note: "Sender domain registered yesterday.", assigneeId: admin.userId, notify: true });
    const seen = await customerIncident(org.tenant, incident.reference);
    expect(seen?.ourAction).toBe("We blocked the sender for everyone.");
    expect(seen?.events.map((e) => e.body).join(" ")).not.toContain("registered yesterday");
    expect(seen?.events.map((e) => e.body).join(" ")).toContain("We blocked the sender");
    expect(await db.securityIncidentEvent.count({ where: { incidentId: incident.id, kind: "note", visibleToCustomer: false } })).toBe(1);
    expect((await db.securityIncident.findUniqueOrThrow({ where: { id: incident.id } })).assigneeId).toBe(admin.userId);
    await expect(updateIncident({ db, staff: support }, incident.id, { assigneeId: org.owner.userId })).rejects.toMatchObject({ fieldErrors: { assigneeId: expect.any(String) } });

    // Nobody answered this one: escalated once per target interval.
    const late = await db.securityIncident.create({
      data: { reference: `SEC-LATE-${org.organisationId.slice(-6)}`, organisationId: org.organisationId, title: "Malware on a server", summary: "x", severity: "CRITICAL", respondBy: new Date(opened.getTime() + 15 * 60_000) },
    });
    const at = new Date(opened.getTime() + 20 * 60_000);
    expect(await escalateLate(db, at)).toBeGreaterThanOrEqual(1);
    expect(await escalateLate(db, new Date(at.getTime() + 5 * 60_000))).toBe(0);
    expect(await escalateLate(db, new Date(at.getTime() + 16 * 60_000))).toBeGreaterThanOrEqual(1);
    expect((await db.securityIncident.findUniqueOrThrow({ where: { id: late.id } })).escalationLevel).toBe(2);
    expect(await db.outboundEmail.count({ where: { kind: "soc.escalation", toAddress: "soc-escalations@example.com", payload: { path: ["incidentId"], equals: late.id } } })).toBe(2);
  }, 180_000);

  it("captures interest as a pre-sales lead before the feature is on", async () => {
    const org = await makeOrganisation("Mahalapye Motors");
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    await expect(registerInterest(db, { actor: org.owner, organisation, email: org.email, devices: "lots", note: "" })).rejects.toMatchObject({ field: "devices" });
    const lead = await registerInterest(db, { actor: org.owner, organisation, email: org.email, devices: "12", note: "Two branches." });
    expect(lead).toMatchObject({ source: "PERSON", tool: "managed-security" });
    expect(lead.need).toContain("About 12 devices.");
  });
});
