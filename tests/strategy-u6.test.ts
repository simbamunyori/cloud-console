import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setFeature } from "../src/server/features/features";
import { parseChecks, pushLicenceChange, pushQuantity, requestConsent, saveSecurityChecks, setConsent, syncLicensing, workspaceFacts } from "../src/server/licences/automation";
import { linkTenant, recordLicence, recordTenantUser, requestLicenceChange } from "../src/server/licences/licences";
import { ManualTenantProvider } from "../src/server/licences/provider";
import { RECONCILE_KIND } from "../src/server/licences/reconcile";
import { ApiLicensingVendor, LicensingVendorError, licensingVendorFrom, ManualLicensingVendor, type LicensingVendor } from "../src/server/licences/vendor";
import { savePartner, setPartnerEnabled, testPartner } from "../src/server/partners/partners";
import { scoreFacts } from "../src/server/security/score-facts";
import { scoreChecks } from "../src/server/security/score";
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

describe("strategy U6 units", () => {
  it("speaks the generic licensing contract with the saved headers", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/v1/ping")) return json(200, { account: "Fourth Generation Technologies" });
      if (url.endsWith("/subscriptions")) return json(200, { subscriptions: [{ sku: "O365_BUSINESS_STANDARD", name: "Business Standard", quantity: 4 }, { sku: "", quantity: 1 }, { sku: "X", quantity: -1 }] });
      if (url.includes("/subscriptions/MISSING")) return new Response(null, { status: 404 });
      if (url.includes("/subscriptions/")) return new Response(null, { status: 204 });
      if (url.endsWith("/users")) return json(200, { users: [{ email: "Kabo@Acme.co.bw", name: "Kabo", skus: ["A"], lastSignInAt: "2026-10-01T08:00:00Z" }, { email: "nobody" }] });
      if (url.includes("/consent")) return json(200, { status: "pending", link: "http://insecure.example" });
      if (url.endsWith("/security")) return json(200, { checks: [{ key: "mfa", title: "Multi-factor sign-in", ok: false }, { key: "x" }] });
      if (url.endsWith("/changes")) return json(422, { error: "Licence pool empty" });
      return json(401, {});
    }) as typeof fetch;
    const v = new ApiLicensingVendor({ endpoint: "https://csp.example/", apiKey: "k", custom: { "Reseller-Id": "77" } }, fetcher);
    expect(await v.test()).toBe("Signed in as Fourth Generation Technologies.");
    expect(calls[0].init.headers).toMatchObject({ authorization: "Bearer k", "x-reseller-id": "77" });
    expect(await v.subscriptions("acme.co.bw")).toEqual([{ sku: "O365_BUSINESS_STANDARD", name: "Business Standard", quantity: 4 }]);
    expect(calls[1].url).toBe("https://csp.example/v1/customers/acme.co.bw/subscriptions");
    expect(await v.setQuantity("acme.co.bw", "O365_BUSINESS_STANDARD", 5)).toBe(true);
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ quantity: 5 });
    expect(calls[2].init.method).toBe("PATCH");
    await expect(v.setQuantity("acme.co.bw", "MISSING", 5)).rejects.toBeInstanceOf(LicensingVendorError);
    expect(await v.users("acme.co.bw")).toEqual([{ email: "kabo@acme.co.bw", name: "Kabo", enabled: true, skus: ["A"], lastSignInAt: new Date("2026-10-01T08:00:00Z") }]);
    // Only https links reach customers.
    expect(await v.consent("acme.co.bw", "acme.co.bw")).toEqual({ status: "pending", link: null });
    expect(await v.security("acme.co.bw")).toEqual([{ key: "mfa", title: "Multi-factor sign-in", ok: false }]);
    await expect(v.applyChange("acme.co.bw", { kind: "ASSIGN", email: "a@b.c", name: "A", sku: "S" })).rejects.toThrow("The licensing partner answered 422: Licence pool empty");
    expect(licensingVendorFrom("Microsoft CSP", { mode: "manual" }, {})).toBeInstanceOf(ManualLicensingVendor);
    expect(() => licensingVendorFrom("Microsoft CSP", { mode: "api" }, {})).toThrow(LicensingVendorError);
  });

  it("reads staff-entered settings and feeds the score", () => {
    expect(parseChecks("Multi-factor sign-in required=no\nLegacy sign-in blocked = yes\n")).toEqual([
      { key: "multi-factor-sign-in-required", title: "Multi-factor sign-in required", ok: false },
      { key: "legacy-sign-in-blocked", title: "Legacy sign-in blocked", ok: true },
    ]);
    expect(parseChecks("nonsense")).toMatch(/^Write each setting/);
    const facts = workspaceFacts([
      { consent: "GRANTED", securityChecks: [{ key: "a", title: "A", ok: true }, { key: "b", title: "B", ok: false }] },
      { consent: "NONE", securityChecks: null },
    ]);
    expect(facts).toEqual({ workspace: { failing: ["B"], total: 2 }, workspaceNeedsAccess: true });
    expect(workspaceFacts([{ consent: "REQUESTED", securityChecks: null }])).toEqual({ workspace: null, workspaceNeedsAccess: true });
  });
});

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("u6"), name: `Tumelo ${role}`, passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

/** A fake partner answering only for the given tenants, so other tests' tenants are left alone. */
function fakeVendor(refs: string[], overrides: Partial<LicensingVendor> = {}): LicensingVendor {
  const mine = (ref: string) => refs.includes(ref);
  return {
    kind: "api",
    test: async () => "ok",
    subscriptions: async () => null,
    setQuantity: async (ref) => mine(ref),
    users: async () => null,
    applyChange: async (ref) => mine(ref),
    consent: async () => null,
    security: async () => null,
    ...overrides,
  };
}

describe.skipIf(!hasDb)("strategy U6", () => {
  let admin: StaffActor;
  let provisioning: StaffActor;

  beforeAll(async () => {
    admin = await staff("ADMIN");
    provisioning = await staff("PROVISIONING");
    await db.featureSwitch.deleteMany({ where: { key: "microsoft-licensing" } });
    await db.partnerSetting.deleteMany({ where: { key: "microsoft-csp" } });
  });
  afterAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: "microsoft-licensing" } });
    await db.partnerSetting.deleteMany({ where: { key: "microsoft-csp" } });
  });

  async function withTenant(name: string, domain: string) {
    const org = await makeOrganisation(name);
    const deps = { db, staff: provisioning };
    const ms = await linkTenant(deps, org.organisationId, { vendor: "MICROSOFT", primaryDomain: domain });
    const standard = await recordLicence(deps, org.organisationId, { tenantId: ms.id, sku: "O365_BUSINESS_STANDARD", name: `Business Standard ${domain}`, purchased: 3 });
    const kabo = await recordTenantUser(deps, org.organisationId, { tenantId: ms.id, name: "Kabo Sello", email: `kabo@${domain}`, licenceIds: [standard.id] });
    const scanner = await recordTenantUser(deps, org.organisationId, { tenantId: ms.id, name: "Scanner", email: `scanner@${domain}`, licenceIds: [] });
    return { ...org, ms, standard, kabo, scanner };
  }

  it("sets up Microsoft CSP in Partners before its automation can be turned on", async () => {
    await expect(setFeature({ db, staff: admin }, "microsoft-licensing", true)).rejects.toMatchObject({ code: "conflict" });
    const input = { mode: "api", endpoint: "", apiKey: "", apiSecret: "", consentLink: "http://partner.example/gdap", custom: "" };
    await expect(savePartner({ db, staff: admin }, "microsoft-csp", input)).rejects.toMatchObject({ fieldErrors: { endpoint: expect.any(String), apiKey: expect.any(String), consentLink: expect.any(String) } });
    await savePartner({ db, staff: admin }, "microsoft-csp", { ...input, mode: "manual", consentLink: "https://partner.example/gdap?domain={domain}" });
    expect((await testPartner({ db, staff: admin }, "microsoft-csp")).ok).toBe(true);
    await setPartnerEnabled({ db, staff: admin }, "microsoft-csp", true);
    await setFeature({ db, staff: admin }, "microsoft-licensing", true);
    expect((await db.featureSwitch.findUniqueOrThrow({ where: { key: "microsoft-licensing" } })).enabled).toBe(true);
  });

  it("closes a change's task when the partner takes it, and leaves it with the reason when it refuses", async () => {
    const o = await withTenant("Mochudi Motors", "mochudi.co.bw");
    const ctx = { organisationId: o.organisationId, organisationName: "Mochudi Motors", actor: o.owner, provider: new ManualTenantProvider() };
    const first = await requestLicenceChange(o.tenant, ctx, { kind: "ASSIGN", tenantUserId: o.scanner.id, licenceId: o.standard.id });
    expect(first.applied).toBe(false);
    const applied: unknown[] = [];
    const vendor = fakeVendor(["mochudi.co.bw"], {
      applyChange: async (ref, change) => {
        applied.push({ ref, ...change });
        return true;
      },
    });
    expect(await pushLicenceChange(db, first.change.id, { build: () => vendor })).toBe("done");
    expect(applied).toEqual([{ ref: "mochudi.co.bw", kind: "ASSIGN", email: "scanner@mochudi.co.bw", name: "Scanner", sku: "O365_BUSINESS_STANDARD" }]);
    expect(await db.licenceChange.findUniqueOrThrow({ where: { id: first.change.id } })).toMatchObject({ status: "DONE", vendorAttempts: 1 });
    expect(await db.provisioningTask.findUniqueOrThrow({ where: { id: first.change.taskId! } })).toMatchObject({ status: "DONE", notes: "Done automatically through Microsoft CSP (First Distribution)." });
    expect(await db.licenceAssignment.count({ where: { tenantUserId: o.scanner.id } })).toBe(1);

    const second = await requestLicenceChange(o.tenant, ctx, { kind: "UNASSIGN", tenantUserId: o.kabo.id, licenceId: o.standard.id });
    const refusing = fakeVendor(["mochudi.co.bw"], { applyChange: async () => Promise.reject(new LicensingVendorError("The licensing partner answered 422.")) });
    expect(await pushLicenceChange(db, second.change.id, { build: () => refusing })).toBe("failed");
    expect(await db.licenceChange.findUniqueOrThrow({ where: { id: second.change.id } })).toMatchObject({ status: "PENDING", vendorError: "The licensing partner answered 422." });
    const task = await db.provisioningTask.findUniqueOrThrow({ where: { id: second.change.taskId! } });
    expect(task.status).toBe("OPEN");
    expect(task.notes).toContain("refused it automatically: The licensing partner answered 422.");

    // A new licence count goes to the partner too.
    const countTask = await db.provisioningTask.create({ data: { organisationId: o.organisationId, family: "PRODUCTIVITY", kind: "change_quantity", title: "Change seats", instructions: "x", expectedBy: new Date() } });
    expect(await pushQuantity(db, { organisationId: o.organisationId, serviceName: o.standard.name, quantity: 5, taskId: countTask.id }, { build: () => vendor })).toBe("done");
    expect(await db.tenantLicence.findUniqueOrThrow({ where: { id: o.standard.id } })).toMatchObject({ vendorQuantity: 5 });
    expect((await db.provisioningTask.findUniqueOrThrow({ where: { id: countTask.id } })).status).toBe("DONE");
    // With the automation off it is our team's task, as before.
    await db.featureSwitch.update({ where: { key: "microsoft-licensing" }, data: { enabled: false } });
    expect(await pushLicenceChange(db, second.change.id, { build: () => vendor })).toBe("manual");
    await db.featureSwitch.update({ where: { key: "microsoft-licensing" }, data: { enabled: true } });
  });

  it("syncs counts, people, access and settings each night, opening each difference as a task once", async () => {
    const o = await withTenant("Kanye Kitchens", "kanye.co.bw");
    const vendor = fakeVendor(["kanye.co.bw"], {
      subscriptions: async (ref) => (ref === "kanye.co.bw" ? [{ sku: "O365_BUSINESS_STANDARD", name: "Business Standard", quantity: 4 }, { sku: "EXCHANGE_P1", name: "Exchange Online", quantity: 2 }] : null),
      users: async (ref) =>
        ref === "kanye.co.bw"
          ? [
              { email: "kabo@kanye.co.bw", name: "Kabo Sello", enabled: true, skus: ["O365_BUSINESS_STANDARD"], lastSignInAt: new Date("2026-10-05T07:00:00Z") },
              { email: "new@kanye.co.bw", name: "New Person", enabled: true, skus: [], lastSignInAt: null },
            ]
          : null,
      consent: async (ref) => (ref === "kanye.co.bw" ? { status: "granted", link: null } : null),
      security: async (ref) => (ref === "kanye.co.bw" ? [{ key: "mfa", title: "Multi-factor sign-in for everyone", ok: false }, { key: "audit", title: "Audit log on", ok: true }] : null),
    });
    const now = new Date("2026-10-06T03:00:00Z");
    await syncLicensing(db, { build: () => vendor, now });
    const tasks = await db.provisioningTask.findMany({ where: { organisationId: o.organisationId, kind: RECONCILE_KIND }, orderBy: { title: "asc" } });
    expect(tasks.map((t) => t.title)).toEqual([
      "Business Standard kanye.co.bw: partner has 4, console records 3 (Kanye Kitchens)",
      "Exchange Online: partner has 2, not recorded in the console (Kanye Kitchens)",
      "People differ in Microsoft 365 kanye.co.bw (Kanye Kitchens)",
    ]);
    expect(tasks[2].instructions).toContain("scanner@kanye.co.bw is in the console but not with the partner.");
    expect(tasks[2].instructions).toContain("new@kanye.co.bw is with the partner but not in the console.");
    expect(await db.tenantUser.findUniqueOrThrow({ where: { id: o.kabo.id } })).toMatchObject({ lastSignInAt: new Date("2026-10-05T07:00:00Z") });
    expect(await db.tenant.findUniqueOrThrow({ where: { id: o.ms.id } })).toMatchObject({ consent: "GRANTED", consentGrantedAt: now, lastSyncedAt: now });

    await syncLicensing(db, { build: () => vendor, now: new Date(now.getTime() + 86_400_000) });
    expect(await db.provisioningTask.count({ where: { organisationId: o.organisationId, kind: RECONCILE_KIND } })).toBe(3);

    // The settings count in the security score.
    const facts = await scoreFacts(db, o.organisationId, { services: [], emailDomain: null, email: null, now });
    expect(facts.workspace).toEqual({ failing: ["Multi-factor sign-in for everyone"], total: 2 });
    expect(scoreChecks(facts).find((c) => c.key === "workspace")?.status).toBe("warn");
  });

  it("gives customers the admin access link, and staff record access and settings by hand", async () => {
    const o = await withTenant("Ramotswa Roofing", "ramotswa.co.bw");
    const before = await scoreFacts(db, o.organisationId, { services: [], emailDomain: null, email: null, now: new Date() });
    expect(scoreChecks(before).find((c) => c.key === "workspace")).toMatchObject({ status: "unknown", fix: { label: "Give us access", href: "/app/licences" } });

    const { link } = await requestConsent(o.tenant, { root: db, organisationId: o.organisationId, organisationName: "Ramotswa Roofing", actor: o.owner, build: () => new ManualLicensingVendor("Microsoft CSP") }, o.ms.id);
    expect(link).toBe("https://partner.example/gdap?domain=ramotswa.co.bw");
    expect(await db.tenant.findUniqueOrThrow({ where: { id: o.ms.id } })).toMatchObject({ consent: "REQUESTED", consentLink: link });
    expect(await db.auditEvent.count({ where: { organisationId: o.organisationId, action: "tenant.consent_requested" } })).toBe(1);

    await expect(saveSecurityChecks({ db, staff: provisioning }, o.organisationId, o.ms.id, "MFA=no")).rejects.toMatchObject({ code: "conflict" });
    await setConsent({ db, staff: provisioning }, o.organisationId, o.ms.id, true);
    await expect(saveSecurityChecks({ db, staff: provisioning }, o.organisationId, o.ms.id, "bad line")).rejects.toMatchObject({ field: "checks" });
    await saveSecurityChecks({ db, staff: provisioning }, o.organisationId, o.ms.id, "Multi-factor sign-in for everyone=yes\nLegacy sign-in blocked=yes");
    const after = await scoreFacts(db, o.organisationId, { services: [], emailDomain: null, email: null, now: new Date() });
    expect(scoreChecks(after).find((c) => c.key === "workspace")?.status).toBe("pass");
    await expect(requestConsent(o.tenant, { root: db, organisationId: o.organisationId, organisationName: "Ramotswa Roofing", actor: o.owner }, o.ms.id)).rejects.toMatchObject({ code: "conflict" });

    // Taking access away clears the settings it gave.
    await setConsent({ db, staff: provisioning }, o.organisationId, o.ms.id, false);
    expect(await db.tenant.findUniqueOrThrow({ where: { id: o.ms.id } })).toMatchObject({ consent: "NONE", securityChecks: null });
  });
});
