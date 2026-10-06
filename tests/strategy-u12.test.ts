import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedStubCatalogue } from "../src/server/billing/stub/catalogue";
import { addBundleInclusions, CONNECT_BUNDLES, CONNECT_PRODUCTS, seedCatalogue } from "../src/server/catalogue/seed-data";
import { connectivityOffered, describeConnectRequest, parseConnectRequest, saveLicence } from "../src/server/connectivity/connectivity";
import { featureOn, setFeature } from "../src/server/features/features";
import { requestQuote } from "../src/server/quotes/quotes";
import type { StaffActor } from "../src/server/staff/access";
import { db, hasDb, uniqueEmail } from "./helpers";

const ask = { sites: "Gaborone, Plot 64518, Fairgrounds\nFrancistown, 12 Blue Jacket Street\n", speed: "50-200", standby: true, cloudLink: false, managed: true, startBy: "" };

describe("strategy U12 units", () => {
  it("reads the sites, one per line, and describes the request in plain words", () => {
    const r = parseConnectRequest(ask);
    expect(r.sites).toEqual([
      { place: "Gaborone", address: "Plot 64518, Fairgrounds" },
      { place: "Francistown", address: "12 Blue Jacket Street" },
    ]);
    expect(describeConnectRequest(r)).toBe(
      ["Connectivity for 2 sites:", "- Gaborone, Plot 64518, Fairgrounds", "- Francistown, 12 Blue Jacket Street", "Speed: 50 to 200 Mbps.", "Wants a standby link that takes over if the main one fails.", "Interested in a bundle with managed security and support."].join("\n"),
    );
    expect(() => parseConnectRequest({ ...ask, sites: " \n", speed: "fast", startBy: "2020-01-01" })).toThrow(expect.objectContaining({ fieldErrors: { sites: expect.any(String), speed: expect.any(String), startBy: expect.any(String) } }));
  });
});

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("u12"), name: `Tumelo ${role}`, passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

describe.skipIf(!hasDb)("strategy U12", () => {
  let admin: StaffActor;
  beforeAll(async () => {
    const ids = await seedStubCatalogue(db);
    await seedCatalogue(db, ids, []);
    await db.featureSwitch.deleteMany({ where: { key: "connectivity" } });
    await db.connectivityLicence.deleteMany({});
    admin = await staff("ADMIN");
  }, 180_000);
  afterAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: "connectivity" } });
    await db.connectivityLicence.deleteMany({});
  });

  it("keeps the Connect products and bundles as drafts sold by quote, each bundle with what it includes", async () => {
    const products = await db.product.findMany({ where: { slug: { in: CONNECT_PRODUCTS } }, include: { category: true } });
    expect(products).toHaveLength(CONNECT_PRODUCTS.length);
    expect(products.every((p) => p.status === "DRAFT" && p.fulfilment === "QUOTE" && p.category.familyKey === "connectivity")).toBe(true);
    const bundles = await db.product.findMany({ where: { slug: { in: ["connected-secure-office", "connected-branch-network"] } }, select: { id: true } });
    await db.productInclusion.deleteMany({ where: { planId: { in: bundles.map((b) => b.id) } } });
    await addBundleInclusions(db, CONNECT_PRODUCTS);
    const included = await db.productInclusion.findMany({ where: { planId: { in: bundles.map((b) => b.id) } }, include: { plan: true, included: true } });
    expect(included.map((i) => [i.plan.slug, i.included.slug]).sort()).toEqual([...CONNECT_BUNDLES].sort());
  });

  it("can't be switched on, or offered, until a market's licence is recorded", async () => {
    await expect(setFeature({ db, staff: admin }, "connectivity", true)).rejects.toMatchObject({ code: "conflict" });
    const support = await staff("SUPPORT");
    await expect(saveLicence({ db, staff: support }, "bw", { regulator: "BOCRA", reference: "L-1", grantedOn: "2026-10-01" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveLicence({ db, staff: admin }, "bw", { regulator: "", reference: "", grantedOn: "2999-01-01" })).rejects.toMatchObject({ fieldErrors: { regulator: expect.any(String), reference: expect.any(String), grantedOn: expect.any(String) } });
    await saveLicence({ db, staff: admin }, "bw", { regulator: "BOCRA", reference: "NFP-0042", grantedOn: "2026-10-01" });
    expect(await connectivityOffered(db, "bw")).toBe(false);
    await setFeature({ db, staff: admin }, "connectivity", true);
    expect(await connectivityOffered(db, "bw")).toBe(true);
    // Only where licensed.
    expect(await connectivityOffered(db, "za")).toBe(false);
    expect(await db.staffAuditEvent.count({ where: { actorUserId: admin.userId, action: "connectivity.licence-saved" } })).toBe(1);
  });

  it("records the sites with the quote request, and the quote's words carry them", async () => {
    const r = parseConnectRequest(ask);
    const quote = await requestQuote(db, { name: "Kagiso Molefe", company: "Kgale Logistics", email: uniqueEmail("connect"), phone: "+267 71 000 000", country: "BW", need: describeConnectRequest(r), connect: r }, { market: "bw" });
    const saved = await db.connectivityRequest.findUniqueOrThrow({ where: { quoteId: quote.id } });
    expect(saved).toMatchObject({ speed: "50-200", standby: true, cloudLink: false, managed: true, startBy: null });
    expect(saved.sites).toEqual(r.sites);
    expect(quote.need).toContain("Francistown, 12 Blue Jacket Street");
  });

  it("switches itself off when the last licence is removed", async () => {
    await saveLicence({ db, staff: admin }, "bw", { regulator: "", reference: "", grantedOn: "", remove: true });
    expect(await featureOn(db, "connectivity")).toBe(false);
    expect(await connectivityOffered(db, "bw")).toBe(false);
  });
});
