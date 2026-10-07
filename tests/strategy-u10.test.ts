import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { monthOf } from "../src/lib/domain/pricing";
import { scopedBilling } from "../src/server/billing/scoped";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { setFeature } from "../src/server/features/features";
import { placeOrder, type OrderDeps } from "../src/server/orders/orders";
import { savePartner, setPartnerEnabled, testPartner } from "../src/server/partners/partners";
import type { StaffActor } from "../src/server/staff/access";
import { pillarOf } from "../src/server/success/success";
import { ApiThebe, ManualThebe, ThebeError, thebeFrom, type ThebeClient } from "../src/server/thebe/client";
import { createThebeOrganisation, isThebePlan, recordThebeOrganisation, retryThebe } from "../src/server/thebe/thebe";
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

describe("strategy U10 units", () => {
  it("speaks Thebe's provisioning contract and keeps only https addresses", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let answer = json(201, { id: "org_1", url: "https://acme.thebe.africa" });
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/v1/ping")) return json(200, { account: "Fourth Generation Technologies" });
      return answer;
    }) as typeof fetch;
    const client = new ApiThebe({ endpoint: "https://api.thebe.example/", apiKey: "k" }, fetcher);
    expect(await client.test()).toBe("Signed in as Fourth Generation Technologies.");
    expect(calls[0].init.headers).toMatchObject({ authorization: "Bearer k" });
    const input = { reference: "o1", name: "Acme", plan: "Team", users: 1, owner: { name: "Neo", email: "neo@acme.co.bw" }, country: "BW" };
    expect(await client.createOrganisation(input)).toEqual({ id: "org_1", url: "https://acme.thebe.africa" });
    expect(calls[1].url).toBe("https://api.thebe.example/v1/organisations");
    expect(JSON.parse(String(calls[1].init.body))).toEqual(input);
    answer = json(201, { id: "org_1", url: "http://acme.thebe.africa" });
    await expect(client.createOrganisation(input)).rejects.toBeInstanceOf(ThebeError);
    answer = json(422, { error: "Email already used" });
    await expect(client.createOrganisation(input)).rejects.toThrow("Thebe answered 422: Email already used");
    expect(thebeFrom({ mode: "manual" }, {})).toBeInstanceOf(ManualThebe);
    expect(() => thebeFrom({ mode: "api" }, {})).toThrow(ThebeError);
    expect(isThebePlan("thebe-team")).toBe(true);
    expect(isThebePlan("business-email")).toBe(false);
    expect(pillarOf({ categoryKey: "expense-management", slug: "thebe-team" })).toBe("apps");
  });
});

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("u10"), name: `Tumelo ${role}`, passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

describe.skipIf(!hasDb)("strategy U10", () => {
  const stub = new StubBillingAdapter(db);
  const month = monthOf(new Date());
  let admin: StaffActor;

  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, [month]);
    await db.product.update({ where: { slug: "thebe-team" }, data: { status: "LIVE" } });
    await db.featureSwitch.deleteMany({ where: { key: "thebe-automation" } });
    await db.partnerSetting.deleteMany({ where: { key: "thebe" } });
    admin = await staff("ADMIN");
  }, 180_000);
  afterAll(async () => {
    await db.product.update({ where: { slug: "thebe-team" }, data: { status: "DRAFT" } });
    await db.featureSwitch.deleteMany({ where: { key: "thebe-automation" } });
    await db.partnerSetting.deleteMany({ where: { key: "thebe" } });
  });

  async function subscriber(name: string) {
    const org = await makeOrganisation(name);
    const billing = await scopedBilling(db, stub, org.organisationId);
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    const deps: OrderDeps = { db: org.tenant, billing, organisation, actor: org.owner };
    const order = await placeOrder(deps, { slug: "thebe-team", quantity: 1, options: {}, startNow: true });
    return { ...org, order };
  }

  const builds = (made: () => Promise<{ id: string; url: string } | null>) => () => ({ kind: "api", test: async () => "ok", createOrganisation: made }) as ThebeClient;

  it("sells a plan like any product: the order makes its setup task, and with automation off it stays with our team", async () => {
    const org = await subscriber("Palapye Paints");
    const account = await db.thebeAccount.findUniqueOrThrow({ where: { organisationId: org.organisationId } });
    expect(account).toMatchObject({ plan: "thebe-team", users: 1, orderId: org.order.id, status: "PENDING", thebeId: null });
    expect(account.taskId).toBeTruthy();
    expect(await createThebeOrganisation(db, stub, org.organisationId, { build: builds(async () => ({ id: "x", url: "https://x.example" })) })).toBe("manual");
    expect((await db.provisioningTask.findUniqueOrThrow({ where: { id: account.taskId! } })).status).toBe("OPEN");
  });

  it("creates the organisation through Thebe once the partner and feature are on, closes the task and tells the customer", async () => {
    await expect(setFeature({ db, staff: admin }, "thebe-automation", true)).rejects.toMatchObject({ code: "conflict" });
    await expect(savePartner({ db, staff: admin }, "thebe", { mode: "api", endpoint: "", apiKey: "" })).rejects.toMatchObject({ fieldErrors: { endpoint: expect.any(String), apiKey: expect.any(String) } });
    await savePartner({ db, staff: admin }, "thebe", { mode: "api", endpoint: "https://api.thebe.example", apiKey: "secret-key" });
    expect((await db.partnerSetting.findUniqueOrThrow({ where: { key: "thebe" } })).secrets).not.toContain("secret-key");
    expect((await testPartner({ db, staff: admin, build: () => ({ test: async () => "Signed in." }) }, "thebe")).ok).toBe(true);
    await setPartnerEnabled({ db, staff: admin }, "thebe", true);
    await setFeature({ db, staff: admin }, "thebe-automation", true);

    const org = await subscriber("Maun Mangoes");
    const refuse = builds(async () => Promise.reject(new ThebeError("Thebe answered 422: Email already used")));
    expect(await createThebeOrganisation(db, stub, org.organisationId, { build: refuse })).toBe("failed");
    const failed = await db.thebeAccount.findUniqueOrThrow({ where: { organisationId: org.organisationId } });
    expect(failed).toMatchObject({ status: "FAILED", attempts: 1, error: "Thebe answered 422: Email already used" });
    expect((await db.provisioningTask.findUniqueOrThrow({ where: { id: failed.taskId! } })).notes).toContain("Email already used");

    const made = builds(async () => ({ id: `thebe-${org.organisationId}`, url: "https://maun-mangoes.thebe.africa" }));
    expect(await retryThebe(db, stub, { build: made })).toBeGreaterThanOrEqual(1);
    const ready = await db.thebeAccount.findUniqueOrThrow({ where: { organisationId: org.organisationId } });
    expect(ready).toMatchObject({ status: "ACTIVE", url: "https://maun-mangoes.thebe.africa", attempts: 2, error: null });
    expect((await db.provisioningTask.findUniqueOrThrow({ where: { id: ready.taskId! } })).status).toBe("DONE");
    expect((await db.order.findUniqueOrThrow({ where: { id: org.order.id } })).status).toBe("ACTIVE");
    const email = await db.outboundEmail.findFirst({ where: { organisationId: org.organisationId, kind: "order.ready" } });
    expect(JSON.stringify(email?.payload)).toContain("https://maun-mangoes.thebe.africa");
    expect(await db.auditEvent.count({ where: { organisationId: org.organisationId, action: "thebe.ready", actorKind: "SYSTEM" } })).toBe(1);
    // Never a second organisation.
    expect(await createThebeOrganisation(db, stub, org.organisationId, { build: made })).toBe("skipped");
  });

  it("lets staff record an organisation made by hand", async () => {
    const org = await subscriber("Kasane Kites");
    const support = await staff("SUPPORT");
    await expect(recordThebeOrganisation({ db, staff: support }, org.organisationId, { thebeId: "t1", url: "https://k.thebe.africa" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(recordThebeOrganisation({ db, staff: admin }, org.organisationId, { thebeId: "", url: "http://k" })).rejects.toMatchObject({ fieldErrors: { thebeId: expect.any(String), url: expect.any(String) } });
    await recordThebeOrganisation({ db, staff: admin }, org.organisationId, { thebeId: "t1", url: "https://k.thebe.africa" });
    expect(await db.thebeAccount.findUniqueOrThrow({ where: { organisationId: org.organisationId } })).toMatchObject({ status: "ACTIVE", thebeId: "t1", url: "https://k.thebe.africa" });
    expect(await db.auditEvent.count({ where: { organisationId: org.organisationId, action: "thebe.recorded" } })).toBe(1);
    const other = await makeOrganisation("No Thebe Here");
    await expect(recordThebeOrganisation({ db, staff: admin }, other.organisationId, { thebeId: "t2", url: "https://n.thebe.africa" })).rejects.toMatchObject({ code: "not-found" });
  });
});
