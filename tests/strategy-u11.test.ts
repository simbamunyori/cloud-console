import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accountContact, dismissWelcome, saveContactCard, setAccountContact, welcomeChecklist } from "../src/server/experience/experience";
import { setFeature } from "../src/server/features/features";
import type { StaffActor } from "../src/server/staff/access";
import { estimate, type Need } from "../src/server/tools/calculator";
import { money } from "../src/lib/domain/money";
import { addMember, db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

const KEYS = ["first-week-checklist", "account-contacts", "plan-recommender", "security-score"];

describe("strategy U11 units", () => {
  it("recommends the same plan as the website and Thapelo", () => {
    const prices = [
      { slug: "microsoft-365-business-basic", name: "Microsoft 365 Business Basic", price: money(9000n, "BWP") },
      { slug: "microsoft-365-business-standard", name: "Microsoft 365 Business Standard", price: money(19000n, "BWP") },
      { slug: "google-workspace-business-standard", name: "Google Workspace Business Standard", price: money(18000n, "BWP") },
    ];
    const pick = (needs: Need[]) => estimate({ users: 12, provider: "either", needs }, prices);
    expect(pick([]).plan?.slug).toBe("microsoft-365-business-basic");
    expect(pick(["desktop"]).plan?.slug).toBe("microsoft-365-business-standard");
    expect(pick(["meetings"]).plan?.slug).toBe("google-workspace-business-standard");
    expect(pick(["security"]).plan).toBeNull();
  });
});

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("u11"), name: `Tumelo ${role}`, passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}

describe.skipIf(!hasDb)("strategy U11", () => {
  let admin: StaffActor;
  beforeAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: { in: KEYS } } });
    admin = await staff("ADMIN");
  });
  afterAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: { in: KEYS } } });
  });

  it("shows the first-week checklist to Owners and Admins only while it is on, new and unfinished", async () => {
    const org = await makeOrganisation("Lobatse Lamps");
    const input = { organisationId: org.organisationId, actor: org.owner, liveServices: 0 };
    expect(await welcomeChecklist(db, org.tenant, input)).toBeNull();
    await setFeature({ db, staff: admin }, "first-week-checklist", true);

    const first = await welcomeChecklist(db, org.tenant, input);
    expect(first?.items.map((i) => [i.key, i.done])).toEqual([
      ["company", false],
      ["team", false],
      ["service", false],
    ]);
    const reader = await addMember(org.organisationId, "READ_ONLY");
    expect(await welcomeChecklist(db, org.tenant, { ...input, actor: reader })).toBeNull();

    // Each item ticks itself; with the score on, adding the email domain is one more.
    await db.organisation.update({ where: { id: org.organisationId }, data: { addressLine1: "Plot 1", city: "Lobatse" } });
    await setFeature({ db, staff: admin }, "security-score", true);
    const second = await welcomeChecklist(db, org.tenant, input);
    expect(second).toMatchObject({ done: 2 });
    expect(second?.items.map((i) => i.key)).toEqual(["company", "team", "service", "score"]);
    expect(await welcomeChecklist(db, org.tenant, { ...input, liveServices: 1 })).toMatchObject({ done: 3 });

    // Two weeks on, it goes.
    expect(await welcomeChecklist(db, org.tenant, { ...input, now: new Date(Date.now() + 15 * 86_400_000) })).toBeNull();

    // Hidden for everyone once an Owner or Admin hides it.
    await expect(dismissWelcome({ db, actor: reader }, org.organisationId)).rejects.toMatchObject({ code: "forbidden" });
    await dismissWelcome({ db, actor: org.owner }, org.organisationId);
    expect(await welcomeChecklist(db, org.tenant, input)).toBeNull();
  });

  it("names an account contact that the customer sees, with the colleague's own card", async () => {
    const org = await makeOrganisation("Molepolole Motors");
    const colleague = await staff("SUPPORT");
    await expect(setAccountContact({ db, staff: colleague }, org.organisationId, colleague.userId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(setAccountContact({ db, staff: admin }, org.organisationId, org.owner.userId)).rejects.toMatchObject({ code: "invalid" });
    await setAccountContact({ db, staff: admin }, org.organisationId, colleague.userId);
    expect(await accountContact(db, org.organisationId)).toBeNull();

    await setFeature({ db, staff: admin }, "account-contacts", true);
    expect(await accountContact(db, org.organisationId)).toMatchObject({ name: colleague.name, jobTitle: null, phone: null });
    await expect(saveContactCard({ db, staff: colleague }, { jobTitle: "Account manager", phone: "call me" })).rejects.toMatchObject({ fieldErrors: { phone: expect.any(String) } });
    await saveContactCard({ db, staff: colleague }, { jobTitle: "Account manager", phone: "+267 390 1234" });
    expect(await accountContact(db, org.organisationId)).toMatchObject({ jobTitle: "Account manager", phone: "+267 390 1234" });
    expect(await db.auditEvent.count({ where: { organisationId: org.organisationId, action: "account-contact.set" } })).toBe(1);

    // A colleague who leaves is no longer shown.
    await db.user.update({ where: { id: colleague.userId }, data: { deactivatedAt: new Date() } });
    expect(await accountContact(db, org.organisationId)).toBeNull();
    await setAccountContact({ db, staff: admin }, org.organisationId, "");
    expect(await db.accountContact.count({ where: { organisationId: org.organisationId } })).toBe(0);
    expect(await db.auditEvent.count({ where: { organisationId: org.organisationId, action: "account-contact.removed" } })).toBe(1);
  });
});
