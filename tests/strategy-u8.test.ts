import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { money } from "../src/lib/domain/money";
import type { BillingAdapter, Service } from "../src/server/billing/adapter";
import { TEMPLATES } from "../src/server/email/templates";
import { setFeature } from "../src/server/features/features";
import type { StaffActor } from "../src/server/staff/access";
import { figureStatus, pillarOf, saveSuccessSettings, sendDirectorsReport, takeSnapshot, type SuccessData } from "../src/server/success/success";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

describe("strategy U8 units", () => {
  it("puts each product under its pillar", () => {
    expect(pillarOf({ slug: "microsoft-365-business-standard", categoryKey: "productivity" })).toBe("cloud");
    expect(pillarOf({ slug: "managed-detection-response", categoryKey: "protection" })).toBe("security");
    expect(pillarOf({ slug: "email-security", categoryKey: "protection" })).toBe("security");
    expect(pillarOf({ slug: "backup-microsoft-365", categoryKey: "protection" })).toBe("resilience");
    expect(pillarOf({ slug: "web-hosting", categoryKey: "web" })).toBe("growth");
    expect(pillarOf({ slug: "thebe", categoryKey: "our-software" })).toBe("apps");
    expect(pillarOf({ slug: "legacy-old-hosting-plan-a", categoryKey: "legacy-services" })).toBe("growth");
    expect(pillarOf(null)).toBe("other");
  });

  it("reads every figure as better higher", () => {
    expect(figureStatus(10, 8)).toBe("on-track");
    expect(figureStatus(7, 8)).toBe("behind");
    expect(figureStatus(7, undefined)).toBe("no-target");
    expect(figureStatus(null, 8)).toBe("no-data");
  });
});

const MONTH = "2018-06";
const NOW = new Date(Date.UTC(2018, 6, 1, 7));

describe.skipIf(!hasDb)("strategy U8", () => {
  let admin: StaffActor;
  let support: StaffActor;

  beforeAll(async () => {
    admin = await staff("ADMIN");
    support = await staff("SUPPORT");
    await db.featureSwitch.deleteMany({ where: { key: "directors-report" } });
    await db.successSettings.deleteMany({});
    await db.successSnapshot.deleteMany({ where: { month: { lt: "2019-01" } } });
    await db.lead.deleteMany({ where: { createdAt: { gte: new Date(Date.UTC(2018, 5, 1)), lt: new Date(Date.UTC(2018, 6, 1)) } } });
  });
  afterAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: "directors-report" } });
    await db.successSettings.deleteMany({});
    await db.successSnapshot.deleteMany({ where: { month: { lt: "2019-01" } } });
  });

  it("lets Admins set targets and the directors, and only then switch the email on", async () => {
    await expect(setFeature({ db, staff: admin }, "directors-report", true)).rejects.toMatchObject({ code: "conflict" });
    await expect(saveSuccessSettings({ db, staff: support }, { directorEmails: "", targets: {} })).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveSuccessSettings({ db, staff: admin }, { directorEmails: "not an email", targets: { managedShare: "140", satisfaction: "4.5", leads: "2.5" } })).rejects.toMatchObject({
      fieldErrors: { directorEmails: expect.any(String), managedShare: expect.any(String), leads: expect.any(String) },
    });
    await saveSuccessSettings({ db, staff: admin }, { directorEmails: "Neo@Example.com\nkagiso@example.com, neo@example.com", targets: { managedCustomers: "2", netNew: "1", managedMrr: "1,000", satisfaction: "4.5", leads: "" } });
    const row = await db.successSettings.findUniqueOrThrow({ where: { id: "success" } });
    expect(row.directorEmails).toEqual(["neo@example.com", "kagiso@example.com"]);
    expect(row.targets).toEqual({ managedCustomers: 2, netNew: 1, managedMrr: 1000, satisfaction: 4.5 });
  });

  it("counts managed and hosting-only customers, revenue by pillar, net new and leads", async () => {
    const products = await db.product.findMany({ where: { slug: { in: ["microsoft-365-business-standard", "backup-microsoft-365", "web-hosting"] } } });
    const p = (slug: string) => products.find((x) => x.slug === slug);
    const svc = (slug: string, amountMinor: bigint, currency = "BWP", billingCycle: Service["billingCycle"] = "monthly"): Service => ({
      serviceId: uniqueEmail("s"),
      productId: p(slug)?.billingProductId ?? "none",
      name: p(slug)?.name ?? slug,
      groupName: "",
      status: "active",
      quantity: 1,
      recurring: money(amountMinor, currency),
      billingCycle,
      registeredOn: NOW,
      nextDueOn: NOW,
      details: {},
    });

    const managed = await makeOrganisation("Lobatse Legal");
    const hosting = await makeOrganisation("Palapye Pies");
    const broken = await makeOrganisation("Jwaneng Joinery");
    const ids = { managed: uniqueEmail("c1"), hosting: uniqueEmail("c2"), broken: uniqueEmail("c3") };
    for (const [org, client] of [
      [managed, ids.managed],
      [hosting, ids.hosting],
      [broken, ids.broken],
    ] as const)
      await db.billingAccount.create({ data: { organisationId: org.organisationId, provider: "WHMCS", externalClientId: client } });
    const services: Record<string, Service[]> = {
      [ids.managed]: [svc("microsoft-365-business-standard", 60000n), svc("backup-microsoft-365", 120000n, "BWP", "annually"), { ...svc("web-hosting", 5000n), status: "cancelled" }],
      [ids.hosting]: [svc("web-hosting", 15000n), svc("web-hosting", 1000n, "JPY")],
    };
    const adapter = {
      provider: "WHMCS",
      listServices: async (client: string) => {
        if (client === ids.broken) throw new Error("down");
        return services[client] ?? [];
      },
    } as unknown as BillingAdapter;

    // Last month: one managed customer who has since left, so net new is one in, one out.
    await db.successSnapshot.create({ data: { month: "2018-05", takenAt: NOW, data: { managedIds: ["gone-org"] } } });

    await db.lead.create({ data: lead("EMAIL_CHECK", managed.email) });
    await db.lead.create({ data: lead("EMAIL_CHECK", uniqueEmail("never")) });
    await db.lead.create({ data: lead("QUOTE", uniqueEmail("never")) });
    const product = await db.product.findFirstOrThrow();
    await db.order.create({ data: { reference: `ORD-${uniqueEmail("o").slice(0, 8)}`, organisationId: managed.organisationId, productId: product.id, quantity: 1, unitPriceMinor: 100n, currency: "BWP", monthlyTotalMinor: 100n, expectedBy: NOW, placedById: managed.owner.userId } });

    const d = await takeSnapshot(db, adapter, { month: MONTH, now: NOW });
    expect(d).toMatchObject({ month: MONTH, currency: "BWP", managedCustomers: 1, hostingOnlyCustomers: 1, gained: 1, lost: 1, netNew: 0, unreadable: 1, unconverted: 1 });
    expect(d.managedIds).toEqual([managed.organisationId]);
    expect(d.mrrByPillar).toMatchObject({ cloud: "60000", resilience: "10000", growth: "15000" });
    expect(d).toMatchObject({ managedMrr: "70000", hostingOnlyMrr: "15000", mrrTotal: "85000", managedShare: 82 });
    expect(d).toMatchObject({ leads: 3, converted: 1, conversion: 33 });
    expect(d.leadsBySource).toEqual([
      { source: "EMAIL_CHECK", leads: 2, converted: 1 },
      { source: "QUOTE", leads: 1, converted: 0 },
    ]);

    // The directors' email waits for the switch, then goes once.
    expect((await sendDirectorsReport(db, adapter, NOW)).sent).toBe(0);
    await setFeature({ db, staff: admin }, "directors-report", true);
    expect(await sendDirectorsReport(db, adapter, NOW)).toEqual({ month: MONTH, sent: 2 });
    expect((await sendDirectorsReport(db, adapter, NOW)).sent).toBe(0);
    const ctx = { db, appUrl: "https://console.example", consoleName: "Cloud Console", now: NOW, locale: "en-BW", timeZone: "Africa/Gaborone" };
    const email = await TEMPLATES["success.monthly"]({ month: MONTH }, ctx);
    const text = JSON.stringify(email);
    expect(email?.subject).toMatch(/June 2018: \d figures? behind target/);
    expect(text).toContain("Managed customers");
    expect(text).toContain("1 (target 2, behind)");
    expect(text).toContain("/admin/success");
    expect((await db.successSnapshot.findUniqueOrThrow({ where: { month: MONTH } })).reportedAt).not.toBeNull();
    expect((d as SuccessData).managedIds).not.toContain(hosting.organisationId);
    await db.billingAccount.deleteMany({ where: { externalClientId: { in: Object.values(ids) } } });
  });
});

function lead(source: "EMAIL_CHECK" | "QUOTE", email: string) {
  return { reference: `L-${uniqueEmail("l").slice(0, 10)}`, market: "bw", source, name: "Lesego", email, need: "Help", consentText: "Yes", consentAt: NOW, purgeAfter: new Date(Date.UTC(2030, 0, 1)), createdAt: new Date(Date.UTC(2018, 5, 10)) };
}

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("u8"), name: `Boitumelo ${role}`, passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}
