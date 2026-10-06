import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monthOf } from "../src/lib/domain/pricing";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { customerBackups, requestRestore, setRestoreStatus, syncBackups, updateProtection } from "../src/server/backup/backup";
import { ApiBackupProvider, BackupProviderError, ManualBackupProvider, parseCustomFields, type BackupProvider, type ProviderStatus } from "../src/server/backup/provider";
import { includedWords, removeInclusion, setInclusion, shownInclusions, shownInclusionsBySlug, withIncluded } from "../src/server/catalogue/inclusions";
import { bookRows } from "../src/server/catalogue/price-book";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { setFeature } from "../src/server/features/features";
import { placeOrder, type OrderDeps } from "../src/server/orders/orders";
import { savePartner, setPartnerEnabled, testPartner } from "../src/server/partners/partners";
import { planMargins, setMarginFloor } from "../src/server/pricing/margins";
import { estimate } from "../src/server/tools/calculator";
import type { StaffActor } from "../src/server/staff/access";
import { money } from "../src/lib/domain/money";
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

describe("strategy U3 units", () => {
  it("words a list of included products", () => {
    expect(includedWords([])).toBe("");
    expect(includedWords(["Email security"])).toBe("Email security");
    expect(includedWords(["Email security", "Backup for Microsoft 365"])).toBe("Email security and Backup for Microsoft 365");
    expect(withIncluded(["50 GB mailbox"], ["Email security"])).toEqual(["Email security at no extra charge", "50 GB mailbox"]);
  });

  it("reads custom fields as name=value lines", () => {
    expect(parseCustomFields("tenant = acme\n\nnothing here\nzone=za=north")).toEqual({ tenant: "acme", zone: "za=north" });
    expect(parseCustomFields(undefined)).toEqual({});
  });

  it("tells the calculator what a plan includes", () => {
    const prices = [{ slug: "microsoft-365-business-basic", name: "Microsoft 365 Business Basic", price: money(10000n, "BWP"), included: ["Email security"] }];
    expect(estimate({ users: 3, provider: "microsoft", needs: [] }, prices).plan).toMatchObject({ included: ["Email security"] });
  });

  it("the manual provider passes its test and leaves restores to our team", async () => {
    const p = new ManualBackupProvider();
    expect(await p.test()).toMatch(/Manual mode/);
    expect(await p.statuses()).toEqual([]);
    expect(await p.requestRestore()).toBeNull();
  });

  it("the API provider signs in, maps status and starts restores", async () => {
    const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: init.body as string | undefined });
      if (url.endsWith("/v1/ping")) return json(200, { account: "fgt", protected: 4 });
      if (url.includes("/v1/protections")) return json(200, { protections: [{ ref: "a", health: "success", lastSuccessAt: "2026-10-05T22:00:00Z", retentionDays: 365, coverage: "3 mailboxes" }, { ref: "zzz", health: "ok" }] });
      if (url.endsWith("/v1/restores")) return json(200, { ref: "r-1" });
      return json(404, {});
    }) as unknown as typeof fetch;
    const p = new ApiBackupProvider({ endpoint: "https://backup.example.com/", apiKey: "k", apiSecret: "s", region: "za-north", custom: { Tenant: "fgt" } }, fetcher);
    expect(await p.test()).toBe("Signed in as fgt, 4 protected.");
    expect(calls[0]).toMatchObject({ url: "https://backup.example.com/v1/ping", headers: { authorization: "Bearer k", "x-api-secret": "s", "x-region": "za-north", "x-tenant": "fgt" } });
    const statuses = await p.statuses(["a", "b"]);
    expect(statuses).toEqual([{ ref: "a", health: "OK", lastSuccessAt: new Date("2026-10-05T22:00:00Z"), lastAttemptAt: null, retentionDays: 365, coverage: "3 mailboxes" }]);
    expect(await p.requestRestore({ ref: "a", what: "Thabo's mailbox", fromDay: "2026-10-01", destination: "alongside" })).toEqual({ ref: "r-1" });
    expect(JSON.parse(calls.at(-1)!.body!)).toMatchObject({ ref: "a", destination: "alongside" });
  });

  it("the API provider says plainly when the key is refused", async () => {
    const p = new ApiBackupProvider({ endpoint: "https://backup.example.com", apiKey: "bad", custom: {} }, (async () => json(401, {})) as unknown as typeof fetch);
    await expect(p.test()).rejects.toThrow(new BackupProviderError("The backup provider refused the API key."));
  });
});

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Kagiso Staff", passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

const FEATURES = ["included-protection", "customer-backup"];
const month = monthOf(new Date());
const today = new Date().toISOString().slice(0, 10);

/** A provider in memory: it knows some references and can be told to fail. */
class FakeProvider implements BackupProvider {
  readonly mode = "api" as const;
  fail = false;
  restores: string[] = [];
  constructor(private readonly known: ProviderStatus[] = []) {}
  async test() {
    return "Signed in to the fake.";
  }
  async statuses(refs: string[]) {
    return this.known.filter((k) => refs.includes(k.ref));
  }
  async requestRestore(input: { ref: string }) {
    if (this.fail) throw new BackupProviderError("Not today.");
    this.restores.push(input.ref);
    return { ref: `restore-${this.restores.length}` };
  }
}

describe.skipIf(!hasDb)("strategy U3", () => {
  let admin: StaffActor;
  let savedFloor: number | undefined;

  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, [month]);
    admin = await staff("ADMIN");
    savedFloor = (await db.pricingSettings.findUnique({ where: { id: "global" } }))?.marginFloorBps;
  });

  afterAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: { in: FEATURES } } });
    await db.partnerSetting.deleteMany({ where: { key: "backup-provider" } });
    if (savedFloor !== undefined) await db.pricingSettings.update({ where: { id: "global" }, data: { marginFloorBps: savedFloor } });
  });

  async function feature(key: string, on: boolean) {
    await db.featureSwitch.upsert({ where: { key }, create: { key, enabled: on }, update: { enabled: on } });
  }

  describe("what plans include", () => {
    it("comes from the catalogue: Microsoft 365 includes email security and backup by default", async () => {
      const plan = await db.product.findUniqueOrThrow({ where: { slug: "microsoft-365-business-standard" } });
      const rows = await db.productInclusion.findMany({ where: { planId: plan.id }, include: { included: true } });
      expect(rows.map((r) => r.included.slug).sort()).toEqual(["backup-microsoft-365", "email-security"]);
      const hosting = await db.product.findUniqueOrThrow({ where: { slug: "web-hosting" }, include: { inclusions: { include: { included: true } } } });
      expect(hosting.inclusions.map((i) => i.included.slug)).toEqual(["server-backup"]);
    });

    it("is changed by Admins only, one level deep, and audited", async () => {
      const support = await staff("SUPPORT");
      await expect(setInclusion({ db, staff: support }, "managed-vps-small", "email-security", 1)).rejects.toMatchObject({ code: "forbidden" });
      await expect(setInclusion({ db, staff: admin }, "managed-vps-small", "managed-vps-small", 1)).rejects.toMatchObject({ field: "included" });
      await expect(setInclusion({ db, staff: admin }, "managed-vps-small", "microsoft-365-business-basic", 1)).rejects.toMatchObject({ field: "included" });
      await expect(setInclusion({ db, staff: admin }, "server-backup", "email-security", 1)).rejects.toMatchObject({ field: "included" });
      await expect(setInclusion({ db, staff: admin }, "managed-vps-small", "server-backup", 0)).rejects.toMatchObject({ field: "quantity" });

      await setInclusion({ db, staff: admin }, "managed-vps-small", "server-backup", 1);
      await setInclusion({ db, staff: admin }, "managed-vps-small", "server-backup", 2);
      const plan = await db.product.findUniqueOrThrow({ where: { slug: "managed-vps-small" }, include: { inclusions: true } });
      expect(plan.inclusions.find((i) => i.quantity === 2)).toBeTruthy();
      const event = await db.staffAuditEvent.findFirstOrThrow({ where: { actorUserId: admin.userId, action: "catalogue.inclusion-set" }, orderBy: { createdAt: "desc" } });
      expect(event.summary).toBe("Changed Server backup in Managed VPS, small (2 for each server)");
      await setInclusion({ db, staff: admin }, "managed-vps-small", "server-backup", 1);
    });

    it("can be taken out and put back", async () => {
      await removeInclusion({ db, staff: admin }, "web-hosting", "server-backup");
      expect(await db.productInclusion.count({ where: { plan: { slug: "web-hosting" } } })).toBe(0);
      await setInclusion({ db, staff: admin }, "web-hosting", "server-backup", 1);
      expect(await db.staffAuditEvent.count({ where: { actorUserId: admin.userId, action: "catalogue.inclusion-removed" } })).toBe(1);
    });

    it("is shown to customers only once the feature is on", async () => {
      const plan = await db.product.findUniqueOrThrow({ where: { slug: "microsoft-365-business-standard" } });
      await feature("included-protection", false);
      expect(await shownInclusions(db, plan.id)).toEqual([]);
      expect((await shownInclusionsBySlug(db, [plan.slug])).size).toBe(0);
      await feature("included-protection", true);
      expect((await shownInclusions(db, plan.id)).map((i) => i.name)).toEqual(["Email security", "Backup for Microsoft 365"]);
      expect((await shownInclusionsBySlug(db, [plan.slug])).get(plan.slug)).toEqual(["Email security", "Backup for Microsoft 365"]);
      await feature("included-protection", false);
    });

    it("adds what a plan includes to its price suggestion only while the feature is on", async () => {
      const suggestion = async () => (await bookRows(db, "bw", month)).rows.find((r) => r.item === "product:microsoft-365-business-standard")!.suggestion!;
      await feature("included-protection", false);
      const without = await suggestion();
      expect(without.breakdown.included).toBeUndefined();
      await feature("included-protection", true);
      const withIncluded = await suggestion();
      expect(withIncluded.breakdown.included?.map((i) => i.name)).toEqual(["Email security", "Backup for Microsoft 365"]);
      expect(withIncluded.price.amountMinor).toBeGreaterThan(without.price.amountMinor);
      await feature("included-protection", false);
    });
  });

  describe("the plan margin report", () => {
    it("shows each plan's true cost, price and margin per market, warning below the floor", async () => {
      await setMarginFloor({ db, staff: admin }, "99");
      const { floorBps, markets } = await planMargins(db, today);
      expect(floorBps).toBe(9900);
      const bw = markets.find((m) => m.code === "bw")!;
      const m365 = bw.rows.find((r) => r.slug === "microsoft-365-business-standard")!;
      expect(m365.included).toEqual(["Email security", "Backup for Microsoft 365"]);
      expect(m365.cost?.currency).toBe("BWP");
      expect(m365.price).not.toBeNull();
      expect(m365.marginBps).toBeLessThan(9900);
      expect(m365.belowFloor).toBe(true);
      const change = await db.pricingChange.findFirstOrThrow({ where: { userId: admin.userId, field: "margin-floor" } });
      expect(change.toValue).toBe("9900");
      await expect(setMarginFloor({ db, staff: await staff("FINANCE") }, "10")).rejects.toMatchObject({ code: "forbidden" });
      await expect(setMarginFloor({ db, staff: admin }, "100")).rejects.toMatchObject({ field: "floor" });
    });
  });

  describe("orders and backups", () => {
    async function setUp(name: string) {
      const org = await makeOrganisation(name);
      const stub = new StubBillingAdapter(db);
      const billing = await scopedBilling(db, stub, org.organisationId);
      const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
      const deps: OrderDeps = { db: org.tenant, billing, organisation, actor: org.owner };
      return { ...org, organisation, deps };
    }
    const order = (o: Awaited<ReturnType<typeof setUp>>) => placeOrder(o.deps, { slug: "microsoft-365-business-standard", quantity: 3, options: { domain: "kanye-kitchens.co.bw" }, startNow: true });

    it("sets up only the plan while the feature is off", async () => {
      await feature("included-protection", false);
      const o = await setUp("Kanye Kitchens");
      const placed = await order(o);
      expect(await db.provisioningTask.count({ where: { orderId: placed.id } })).toBe(1);
      expect(await o.tenant.backupProtection.count()).toBe(0);
    });

    it("sets up what the plan includes with it, and its backup shows on the Backup page", async () => {
      await feature("included-protection", true);
      const o = await setUp("Mochudi Motors");
      const placed = await order(o);
      const tasks = await db.provisioningTask.findMany({ where: { orderId: placed.id }, orderBy: { createdAt: "asc" } });
      expect(tasks.map((t) => t.title)).toEqual([
        "Set up Microsoft 365 Business Standard x 3 for Mochudi Motors",
        "Set up Email security (included with Microsoft 365 Business Standard) x 3 for Mochudi Motors",
        "Set up Backup for Microsoft 365 (included with Microsoft 365 Business Standard) x 3 for Mochudi Motors",
      ]);
      const protections = await o.tenant.backupProtection.findMany();
      expect(protections).toHaveLength(1);
      expect(protections[0]).toMatchObject({ label: "Microsoft 365 mailboxes, OneDrive and SharePoint", health: "PENDING", billingServiceId: `included:${placed.reference}:backup-microsoft-365` });
      await feature("included-protection", false);
    });

    it("starts a backup when one is ordered on its own", async () => {
      const o = await setUp("Lobatse Legal");
      const placed = await placeOrder(o.deps, { slug: "backup-microsoft-365", quantity: 4, options: {}, startNow: true });
      expect(await o.tenant.backupProtection.findFirstOrThrow()).toMatchObject({ billingServiceId: placed.billingServiceIds[0] });
    });

    it("takes restores: by hand in manual mode, through the API when it can, by hand when the API refuses", async () => {
      const o = await setUp("Ramotswa Rentals");
      await placeOrder(o.deps, { slug: "backup-google-workspace", quantity: 2, options: {}, startNow: true });
      const p = await o.tenant.backupProtection.findFirstOrThrow();
      const deps = { db: o.tenant, actor: o.owner, organisation: o.organisation, today };
      const input = { protectionId: p.id, what: "Thabo's mailbox", fromDay: today, destination: "alongside" };

      await expect(requestRestore({ ...deps, provider: null }, input)).rejects.toMatchObject({ code: "conflict" });
      const provisioning = await staff("PROVISIONING");
      await expect(updateProtection({ db, staff: await staff("SUPPORT") }, p.id, { label: p.label, health: "OK", lastSuccessAt: today, retentionDays: "365", coverage: "", providerRef: "", notes: "" })).rejects.toMatchObject({
        code: "forbidden",
      });
      await updateProtection({ db, staff: provisioning }, p.id, { label: p.label, health: "OK", lastSuccessAt: today, retentionDays: "365", coverage: "2 accounts, 40 GB", providerRef: "gws-77", notes: "Checked in the portal." });
      const logged = await o.tenant.auditEvent.findFirstOrThrow({ where: { action: "backup.updated" } });
      expect(logged).toMatchObject({ actorKind: "STAFF", visibleToCustomer: true, summary: "Updated the Gmail, Drive and shared drives backup: healthy" });

      await expect(requestRestore({ ...deps, provider: null }, { ...input, what: " ", fromDay: "2999-01-01", destination: "moon" })).rejects.toMatchObject({
        fieldErrors: { what: expect.any(String), fromDay: "Choose today or an earlier day.", destination: "Choose where it goes back." },
      });

      const manual = await requestRestore({ ...deps, provider: null }, input);
      expect(manual.status).toBe("REQUESTED");
      const task = await db.provisioningTask.findFirstOrThrow({ where: { id: (await db.backupRestoreRequest.findUniqueOrThrow({ where: { id: manual.id } })).taskId! } });
      expect(task).toMatchObject({ family: "PROTECTION", kind: "restore", title: "Restore from backup for Ramotswa Rentals" });

      const api = new FakeProvider();
      const started = await requestRestore({ ...deps, provider: api }, input);
      expect(started).toMatchObject({ status: "IN_PROGRESS", providerRef: "restore-1", taskId: null });
      expect(api.restores).toEqual(["gws-77"]);

      api.fail = true;
      const fallback = await requestRestore({ ...deps, provider: api }, input);
      const fallbackTask = await db.provisioningTask.findFirstOrThrow({ where: { id: (await db.backupRestoreRequest.findUniqueOrThrow({ where: { id: fallback.id } })).taskId! } });
      expect(fallbackTask.instructions).toMatch(/refused it \(Not today\.\), so do it by hand/);

      await setRestoreStatus({ db, staff: provisioning }, manual.id, "DONE");
      expect(await db.provisioningTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ status: "DONE" });
      await expect(setRestoreStatus({ db, staff: provisioning }, manual.id, "CANCELLED")).rejects.toMatchObject({ code: "conflict" });

      // Customers never see the provider's reference or our notes.
      const seen = await customerBackups(o.tenant);
      expect(JSON.stringify(seen)).not.toMatch(/gws-77|portal|restore-1/);
      expect(seen.restores).toHaveLength(3);
    });

    it("fetches status from the provider's API every hour, and does nothing in manual mode", async () => {
      const o = await setUp("Tlokweng Tiles");
      await placeOrder(o.deps, { slug: "backup-microsoft-365", quantity: 1, options: {}, startNow: true });
      const p = await o.tenant.backupProtection.findFirstOrThrow();
      await db.backupProtection.update({ where: { id: p.id }, data: { providerRef: `tt-${p.id}` } });
      expect(await syncBackups({ db, provider: new ManualBackupProvider() })).toMatchObject({ updated: 0, skipped: "manual" });
      const at = new Date("2026-10-06T01:00:00Z");
      const fake = new FakeProvider([{ ref: `tt-${p.id}`, health: "WARNING", lastSuccessAt: at, lastAttemptAt: at, retentionDays: 30, coverage: "1 mailbox" }]);
      expect((await syncBackups({ db, provider: fake })).updated).toBe(1);
      expect(await db.backupProtection.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ health: "WARNING", lastSuccessAt: at, retentionDays: 30, coverage: "1 mailbox" });
    });
  });

  describe("Admin > Partners > Backup provider", () => {
    it("needs an endpoint and key in API mode, tests the connection, and gates the feature", async () => {
      await expect(savePartner({ db, staff: admin }, "backup-provider", { name: "Acme Backup", mode: "api", endpoint: "http://insecure" })).rejects.toMatchObject({
        fieldErrors: { endpoint: "Enter an address starting with https://." },
      });
      await expect(savePartner({ db, staff: admin }, "backup-provider", { name: "Acme Backup", mode: "api", endpoint: "https://api.acme.example" })).rejects.toMatchObject({
        fieldErrors: { apiKey: "Enter the API key." },
      });
      await savePartner({ db, staff: admin }, "backup-provider", { name: "Acme Backup", mode: "manual" });
      await expect(setFeature({ db, staff: admin }, "customer-backup", true)).rejects.toMatchObject({ code: "conflict" });
      expect(await testPartner({ db, staff: admin }, "backup-provider")).toMatchObject({ ok: true });
      await setPartnerEnabled({ db, staff: admin }, "backup-provider", true);
      await setFeature({ db, staff: admin }, "customer-backup", true);

      // New credentials switch the partner, and the feature, off until a test works again.
      await savePartner({ db, staff: admin }, "backup-provider", { name: "Acme Backup", mode: "api", endpoint: "https://api.acme.example", apiKey: "k" });
      expect(await db.partnerSetting.findUniqueOrThrow({ where: { key: "backup-provider" } })).toMatchObject({ enabled: false, lastTestOk: null });
      expect((await db.featureSwitch.findUniqueOrThrow({ where: { key: "customer-backup" } })).enabled).toBe(false);
      const failed = await testPartner({ db, staff: admin, build: () => ({ test: async () => Promise.reject(new BackupProviderError("The backup provider refused the API key.")) }) }, "backup-provider");
      expect(failed).toEqual({ ok: false, message: "The backup provider refused the API key." });
    });
  });
});
