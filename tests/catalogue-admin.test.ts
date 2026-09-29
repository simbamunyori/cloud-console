import { beforeAll, describe, expect, it } from "vitest";
import { monthOf } from "../src/lib/domain/pricing";
import { catalogueTree, saveCategory, saveFamily, saveProduct, setInternalOrganisation, type ProductInput } from "../src/server/admin/catalogue";
import { scopedBilling } from "../src/server/billing/scoped";
import { linkStubProduct, seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { StubBillingAdapter } from "../src/server/billing/stub/stub-adapter";
import { productBySlug } from "../src/server/catalogue/catalogue";
import { approvePrice, marketplace } from "../src/server/catalogue/price-book";
import { seedCatalogue } from "../src/server/catalogue/seed-data";
import { quoteOrder } from "../src/server/orders/orders";
import type { StaffActor } from "../src/server/staff/access";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

const month = monthOf(new Date());
const bw = { code: "bw", currency: "BWP" };

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("staff"), name: "Onalenna Staff", passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

const id = () => Math.random().toString(36).slice(2, 8);

const productInput = (over: Partial<ProductInput> = {}): ProductInput => ({
  slug: `test-${id()}`,
  name: "Managed firewall",
  summary: "A firewall at your office, watched by us.",
  includes: "Setup at your office\n- Rules kept up to date",
  excludes: "",
  categoryKey: "",
  unitLabel: "per site",
  quantityAllowed: false,
  minQuantity: "1",
  setupHours: "16",
  minTermMonths: "12",
  commitmentNote: "",
  cost: "400",
  costCurrency: "BWP",
  fixedPrice: "",
  fixedPriceCurrency: "BWP",
  markets: ["bw"],
  fulfilment: "MANUAL",
  status: "DRAFT",
  sortOrder: "1",
  ...over,
});

describe.skipIf(!hasDb)("the staff catalogue", () => {
  let admin: StaffActor;
  let deps: { db: typeof db; staff: StaffActor; month: string };

  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, [month]);
    admin = await staff("ADMIN");
    deps = { db, staff: admin, month };
  });

  /** A new draft family with one category, as staff would add them. */
  async function family(status = "DRAFT") {
    const key = `test-${id()}`;
    await saveFamily(deps, { key, name: "Networks", description: "Office networks, run by us.", connector: "SERVICES", status, sortOrder: "900" });
    await saveCategory(deps, { key: `${key}-cat`, name: "Firewalls", description: "Firewalls we manage.", familyKey: key, sortOrder: "1", margin: "30" });
    return { key, category: `${key}-cat` };
  }

  it("is for Admins only", async () => {
    const support = await staff("SUPPORT");
    await expect(saveFamily({ db, staff: support, month }, { key: `x-${id()}`, name: "X", description: "X", connector: "SERVICES", status: "DRAFT", sortOrder: "1" })).rejects.toThrow(/staff role/);
  });

  it("takes a product from draft to live only once it has an approved price, and logs each step", async () => {
    const f = await family("LIVE");
    const input = productInput({ categoryKey: f.category });
    const { slug } = await saveProduct(deps, input);

    // A draft shows nowhere a customer looks.
    expect(await productBySlug(db, slug)).toBeNull();
    expect((await marketplace(db, bw, month)).flatMap((c) => c.products).some((p) => p.product.slug === slug)).toBe(false);

    await expect(saveProduct(deps, { ...input, status: "LIVE" }, slug)).rejects.toMatchObject({ fieldErrors: { status: expect.stringMatching(/Approve a price in BW/) } });
    await approvePrice(deps, "bw", `product:${slug}`, { amount: "650" });
    await saveProduct(deps, { ...input, status: "LIVE" }, slug);

    const live = (await marketplace(db, bw, month)).flatMap((c) => c.products).find((p) => p.product.slug === slug);
    expect(live?.price).toMatchObject({ amountMinor: 65000n, currency: "BWP" });

    const events = await db.staffAuditEvent.findMany({ where: { data: { path: ["product"], equals: slug } }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.action)).toEqual(["catalogue.product-created", "catalogue.product-status"]);
    expect(events[1].data).toMatchObject({ before: { status: "DRAFT" }, after: { status: "LIVE" }, keys: ["status"] });

    // Nothing changed: nothing logged.
    expect((await saveProduct(deps, { ...input, status: "LIVE" }, slug)).changed).toBe(0);
    await saveFamily(deps, { key: f.key, name: "Networks", description: "Office networks, run by us.", connector: "SERVICES", status: "DRAFT", sortOrder: "900" }, f.key);
  });

  it("hides a whole family while it is a draft", async () => {
    const f = await family("DRAFT");
    const { slug } = await saveProduct(deps, productInput({ categoryKey: f.category, fulfilment: "QUOTE", status: "LIVE" }));
    expect(await productBySlug(db, slug)).toBeNull();
    const tree = await catalogueTree(db, month);
    const row = tree.families.find((x) => x.key === f.key)!.categories[0].products[0];
    expect(row).toMatchObject({ slug, status: "LIVE", shown: "DRAFT" });
  });

  it("shows internal products only to our own test organisations, who can order them", async () => {
    const f = await family("LIVE");
    const { slug } = await saveProduct(deps, productInput({ categoryKey: f.category }));
    await approvePrice(deps, "bw", `product:${slug}`, { amount: "650" });
    await saveProduct(deps, productInput({ categoryKey: f.category, status: "INTERNAL" }), slug);
    expect(await linkStubProduct(db, slug)).toBeTruthy();

    const org = await makeOrganisation("Test Kitchen");
    const stub = new StubBillingAdapter(db);
    const billing = await scopedBilling(db, stub, org.organisationId);
    const orderDeps = async () => ({ db: org.tenant, billing, organisation: await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } }), actor: org.owner });

    await expect(quoteOrder(await orderDeps(), { slug, quantity: 1, options: {} })).rejects.toThrow(/isn't on sale/);
    await setInternalOrganisation(deps, org.organisationId, true);
    const quote = await quoteOrder(await orderDeps(), { slug, quantity: 1, options: {} });
    expect(quote.unitPrice).toMatchObject({ amountMinor: 65000n });
    expect((await marketplace(db, bw, month, "internal")).flatMap((c) => c.products).some((p) => p.product.slug === slug)).toBe(true);
    expect((await marketplace(db, bw, month)).flatMap((c) => c.products).some((p) => p.product.slug === slug)).toBe(false);
    expect(await db.staffAuditEvent.findFirst({ where: { action: "catalogue.test-organisation", data: { path: ["organisationId"], equals: org.organisationId } } })).toBeTruthy();
    await saveFamily(deps, { key: f.key, name: "Networks", description: "Office networks, run by us.", connector: "SERVICES", status: "DRAFT", sortOrder: "900" }, f.key);
  });

  it("won't take an order for a product sold by quote", async () => {
    const f = await family("LIVE");
    const { slug } = await saveProduct(deps, productInput({ categoryKey: f.category, fulfilment: "QUOTE", status: "LIVE" }));
    const org = await makeOrganisation("Quote Seekers");
    const billing = await scopedBilling(db, new StubBillingAdapter(db), org.organisationId);
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    await expect(quoteOrder({ db: org.tenant, billing, organisation, actor: org.owner }, { slug, quantity: 1, options: {} })).rejects.toThrow(/sold by quote/);
    await saveFamily(deps, { key: f.key, name: "Networks", description: "Office networks, run by us.", connector: "SERVICES", status: "DRAFT", sortOrder: "900" }, f.key);
  });

  it("checks every field and refuses automatic fulfilment the connector can't do", async () => {
    const f = await family();
    await expect(
      saveProduct(deps, productInput({ categoryKey: f.category, slug: "Not A Slug", name: "", cost: "lots", minTermMonths: "0", fulfilment: "AUTOMATIC" })),
    ).rejects.toMatchObject({
      fieldErrors: { slug: expect.any(String), name: "Enter a name.", cost: expect.any(String), minTermMonths: expect.any(String), fulfilment: expect.stringMatching(/can't set products up by itself/) },
    });
  });

  it("never changes an existing product when the seed runs again", async () => {
    await db.product.update({ where: { slug: "managed-vps-small" }, data: { name: "Managed VPS, small (renamed)" } });
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, [month]);
    expect((await db.product.findUniqueOrThrow({ where: { slug: "managed-vps-small" } })).name).toBe("Managed VPS, small (renamed)");
    await db.product.update({ where: { slug: "managed-vps-small" }, data: { name: "Managed VPS, small" } });
  });
});
