import { afterAll, describe, expect, it } from "vitest";
import { verifyPassword } from "../src/server/auth/password";
import { LATER_PRODUCTS, loadLaunchCatalogue, PRODUCTS } from "../src/server/catalogue/seed-data";
import { createAdmin, fillSupportEmail } from "../src/server/ops/setup";
import { cardPaymentsOn } from "../src/server/payments/live";
import { db, hasDb, uniqueEmail } from "./helpers";

describe("card payments on a production server", () => {
  it("are off with the stub card company, unless placeholders are allowed", () => {
    expect(cardPaymentsOn({ NODE_ENV: "production" })).toBe(false);
    expect(cardPaymentsOn({ NODE_ENV: "production", PAYMENT_ADAPTER: "stub" })).toBe(false);
    expect(cardPaymentsOn({ NODE_ENV: "production", ALLOW_PLACEHOLDERS: "yes" })).toBe(true);
    expect(cardPaymentsOn({ NODE_ENV: "development" })).toBe(true);
    expect(cardPaymentsOn({ NODE_ENV: "production", PAYMENT_ADAPTER: "dpo" })).toBe(true);
  });
});

describe.skipIf(!hasDb)("server set-up commands", () => {
  const created: string[] = [];
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: created } } });
  });

  it("creates a staff Admin who publishes, with a password that signs in, and audits it", async () => {
    const email = uniqueEmail("Admin").toUpperCase();
    const user = await createAdmin(db, { name: " Simba Munyori ", email, password: "a long enough passphrase" });
    created.push(user.email);
    expect(user).toMatchObject({ kind: "STAFF", staffRole: "ADMIN", websiteRole: "PUBLISHER", name: "Simba Munyori", email: email.toLowerCase(), totpEnabled: false });
    expect(await verifyPassword("a long enough passphrase", user.passwordHash)).toBe(true);
    const event = await db.staffAuditEvent.findFirst({ where: { action: "staff.created", data: { path: ["userId"], equals: user.id } } });
    expect(event?.summary).toContain(user.email);
  });

  it("refuses a weak password, a bad address and an address already in use", async () => {
    await expect(createAdmin(db, { name: "A", email: uniqueEmail("a"), password: "short" })).rejects.toThrow(/12 characters/);
    await expect(createAdmin(db, { name: "A", email: "not-an-address", password: "a long enough passphrase" })).rejects.toThrow(/not an email/);
    await expect(createAdmin(db, { name: "A", email: created[0], password: "a long enough passphrase" })).rejects.toThrow(/already has a staff account/);
  });
});

describe("SUPPORT_EMAIL on a new server", () => {
  // A stand-in database: changing the real markets would upset tests running beside this one.
  function fakeDb() {
    const markets = [
      { code: "bw", supportEmail: "support@localhost" },
      { code: "za", supportEmail: "help@example.co.za" },
      { code: "zw", supportEmail: "support@localhost" },
    ];
    const audits: { action: string; summary: string }[] = [];
    const tx = {
      market: {
        findMany: async () => markets.filter((m) => m.supportEmail.includes("@localhost")),
        update: async ({ where, data }: { where: { code: string }; data: { supportEmail: string } }) => Object.assign(markets.find((m) => m.code === where.code)!, data),
      },
      staffAuditEvent: { create: async ({ data }: { data: { action: string; summary: string } }) => audits.push(data) },
    };
    const db = { ...tx, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as Parameters<typeof fillSupportEmail>[0];
    return { db, markets, audits };
  }

  it("fills it only into markets still on the development address, and audits each", async () => {
    const { db, markets, audits } = fakeDb();
    await expect(fillSupportEmail(db, "support@localhost")).rejects.toThrow(/not a real email/);
    expect(await fillSupportEmail(db, undefined)).toEqual([]);
    expect(await fillSupportEmail(db, " Support@FourthGeneration.Technology ")).toEqual(["bw", "zw"]);
    expect(markets.map((m) => m.supportEmail)).toEqual(["support@fourthgeneration.technology", "help@example.co.za", "support@fourthgeneration.technology"]);
    expect(audits.map((a) => a.action)).toEqual(["market.support_email", "market.support_email"]);
    expect(await fillSupportEmail(db, "other@fourthgeneration.technology")).toEqual([]);
  });
});

describe("the launch catalogue on a new production server", () => {
  /**
   * Records every write; the database starts with the given number of
   * products, and the plans and later products unless told otherwise.
   */
  function fakeDb(products: number, plans = products > 0, later: string[] = products > 0 ? LATER_PRODUCTS : []) {
    const writes: { model: string; create: Record<string, unknown> }[] = [];
    const model = (name: string) => ({
      upsert: async ({ create }: { create: Record<string, unknown> }) => (writes.push({ model: name, create }), create),
      count: async () => products,
      findMany: async () => (name === "product" ? later.map((slug) => ({ slug })) : [{ code: "bw" }, { code: "za" }]),
      findUnique: async () => (plans ? { key: "plans" } : null),
    });
    const db = new Proxy({}, { get: (_, name: string) => model(name) });
    return { db: db as never, writes };
  }

  it("loads families, categories, products and domain endings without prices or rates, for the WHMCS sync to link", async () => {
    const { db, writes } = fakeDb(0);
    expect(await loadLaunchCatalogue(db)).toBe(true);
    const products = writes.filter((w) => w.model === "product");
    expect(products).toHaveLength(PRODUCTS.length);
    expect(products.every((p) => p.create.billingProductId === null)).toBe(true);
    expect(writes.some((w) => w.model === "tld")).toBe(true);
    expect(writes.some((w) => w.model === "fxRate" || w.model === "priceBookEntry")).toBe(false);
  });

  it("does nothing once the database has products", async () => {
    const { db, writes } = fakeDb(3);
    expect(await loadLaunchCatalogue(db)).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("adds only the plans, without prices, to a server that loaded the catalogue before them", async () => {
    const { db, writes } = fakeDb(3, false);
    expect(await loadLaunchCatalogue(db)).toBe(true);
    const products = writes.filter((w) => w.model === "product");
    expect(products.map((p) => p.create.slug)).toEqual(PRODUCTS.filter((p) => p.category === "plans").map((p) => p.slug));
    expect(products.every((p) => p.create.status === "INTERNAL")).toBe(true);
    expect(writes.some((w) => w.model === "tld" || w.model === "priceBookEntry")).toBe(false);
  });

  it("adds the products that came later (Milestone 9) as drafts, leaving those it has", async () => {
    const { db, writes } = fakeDb(3, true, ["website-builder"]);
    expect(await loadLaunchCatalogue(db)).toBe(true);
    const products = writes.filter((w) => w.model === "product");
    expect(products.map((p) => p.create.slug).sort()).toEqual(["compliance-archiving", "fourth-generation-signatures"]);
    expect(products.every((p) => p.create.status === "DRAFT" && p.create.fulfilment === "MANUAL" && p.create.billingProductId === null)).toBe(true);
    expect(writes.some((w) => w.model === "tld" || w.model === "priceBookEntry")).toBe(false);
  });
});

describe("the catalogue additions (final build, Milestone 9)", () => {
  const bySlug = (slug: string) => PRODUCTS.find((p) => p.slug === slug)!;

  it("keeps disaster recovery internal and the three new products as drafts, each a staff task", () => {
    expect(bySlug("disaster-recovery")).toMatchObject({ status: "INTERNAL", fulfilment: "MANUAL", category: "protection" });
    expect(bySlug("compliance-archiving")).toMatchObject({ status: "DRAFT", fulfilment: "MANUAL", category: "protection", unitLabel: "per user" });
    expect(bySlug("fourth-generation-signatures")).toMatchObject({ status: "DRAFT", fulfilment: "MANUAL", name: "Fourth Generation Signatures" });
    expect(bySlug("website-builder")).toMatchObject({ status: "DRAFT", fulfilment: "MANUAL", category: "web" });
    expect(LATER_PRODUCTS.every((slug) => PRODUCTS.some((p) => p.slug === slug))).toBe(true);
  });

  it("offers compliance archiving for Microsoft 365 and Google Workspace", () => {
    expect(bySlug("compliance-archiving").options?.[0]).toMatchObject({ key: "service", required: true, choices: ["Microsoft 365", "Google Workspace"] });
  });
});
