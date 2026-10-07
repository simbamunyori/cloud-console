import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEMPLATES } from "../src/server/email/templates";
import { setFeature } from "../src/server/features/features";
import type { StaffActor } from "../src/server/staff/access";
import { customerReply, customerResolve, openTicket, rateTicket, routeTicket, staffReply } from "../src/server/support/tickets";
import { remindRenewals, savePartnerRecord } from "../src/server/units/partner-register";
import { DEFAULT_TARGETS, duration, measureMonth, myQueues, publishedResponseTimes, queueRoutes, routeQueue, saveTarget, setStaffUnits, unitTargets, writeResponseReport } from "../src/server/units/units";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

const MONTH = "2019-03";
const at = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2019, 2, day, hour, minute));

describe("strategy U7 units", () => {
  it("says durations the way people do", () => {
    expect(duration(1)).toBe("1 minute");
    expect(duration(45)).toBe("45 minutes");
    expect(duration(60)).toBe("1 hour");
    expect(duration(8 * 60)).toBe("8 hours");
    expect(duration(3 * 1440)).toBe("3 days");
  });
});

describe.skipIf(!hasDb)("strategy U7", () => {
  let admin: StaffActor;
  let support: StaffActor;
  let finance: StaffActor;

  beforeAll(async () => {
    admin = await staff("ADMIN");
    support = await staff("SUPPORT");
    finance = await staff("FINANCE");
    await db.featureSwitch.deleteMany({ where: { key: "service-standards" } });
    await db.unitRoute.deleteMany({});
    await db.unitTarget.deleteMany({});
    await db.responseReport.deleteMany({ where: { month: { lt: "2020-01" } } });
    // Tickets an earlier run moved into the measured month go further back.
    await db.ticket.updateMany({ where: { createdAt: { gte: at(1, 0), lt: new Date(Date.UTC(2019, 3, 1)) } }, data: { createdAt: new Date(Date.UTC(2018, 0, 1)) } });
  });
  afterAll(async () => {
    await db.featureSwitch.deleteMany({ where: { key: "service-standards" } });
    await db.unitRoute.deleteMany({});
    await db.unitTarget.deleteMany({});
    await db.responseReport.deleteMany({ where: { month: { lt: "2020-01" } } });
  });

  async function customer(name: string) {
    const org = await makeOrganisation(name);
    const organisation = await db.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
    return { ...org, organisation, deps: { db: org.tenant, organisation, actor: org.owner } };
  }

  it("puts colleagues in units and routes each queue to one, for Admins only", async () => {
    await expect(setStaffUnits({ db, staff: support }, support.userId, ["SUPPORT"])).rejects.toMatchObject({ code: "forbidden" });
    await expect(setStaffUnits({ db, staff: admin }, support.userId, ["SUPPORT", "NOPE"])).rejects.toMatchObject({ code: "invalid" });
    await setStaffUnits({ db, staff: admin }, support.userId, ["SUPPORT", "OPERATIONS"]);
    expect((await db.user.findUniqueOrThrow({ where: { id: support.userId } })).units).toEqual(["SUPPORT", "OPERATIONS"]);

    expect((await queueRoutes(db)).invoices).toBe("FINANCE");
    await routeQueue({ db, staff: admin }, "invoices", "SUPPORT");
    expect((await queueRoutes(db)).invoices).toBe("SUPPORT");
    await expect(routeQueue({ db, staff: admin }, "nothing", "SUPPORT")).rejects.toMatchObject({ code: "not-found" });

    const mine = await myQueues(db, support.userId, new Date());
    expect(mine.queues.map((q) => q.key)).toEqual(expect.arrayContaining(["tickets", "incidents", "restores", "invoices"]));
    expect(mine.queues.map((q) => q.key)).not.toContain("leads");
    expect((await myQueues(db, finance.userId)).queues).toEqual([]);
    expect(await db.staffAuditEvent.count({ where: { actorUserId: admin.userId, action: { in: ["units.member", "units.routed"] } } })).toBe(2);
  });

  it("keeps targets per unit and priority, with sensible defaults", async () => {
    expect((await unitTargets(db)).SALES.URGENT).toEqual(DEFAULT_TARGETS.URGENT);
    await expect(saveTarget({ db, staff: admin }, { unit: "SUPPORT", priority: "HIGH", firstResponse: "120", resolve: "60" })).rejects.toMatchObject({ fieldErrors: { resolve: expect.any(String) } });
    await saveTarget({ db, staff: admin }, { unit: "SUPPORT", priority: "NORMAL", firstResponse: "60", resolve: "600" });
    expect((await unitTargets(db)).SUPPORT.NORMAL).toEqual({ firstResponse: 60, resolve: 600 });
  });

  it("times tickets, routes them, and measures the month against the targets", async () => {
    const o = await customer("Kanye Kitchens");
    const quick = await openTicket(o.deps, { subject: "Quick one", body: "Hello" });
    const slow = await openTicket(o.deps, { subject: "Slow one", body: "Hello" });
    await routeTicket({ db, staff: support }, slow.reference, { priority: "URGENT", unit: "SUPPORT" });
    await expect(routeTicket({ db, staff: finance }, slow.reference, { priority: "LOW", unit: "SUPPORT" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(routeTicket({ db, staff: support }, slow.reference, { priority: "SOON", unit: "X" })).rejects.toMatchObject({ fieldErrors: { priority: expect.any(String), unit: expect.any(String) } });

    // A team note isn't a reply; the first reply the customer sees is.
    await staffReply({ db, staff: support }, quick.reference, { body: "Looking", internal: true });
    expect((await db.ticket.findUniqueOrThrow({ where: { id: quick.id } })).firstResponseAt).toBeNull();
    await staffReply({ db, staff: support }, quick.reference, { body: "Done", status: "RESOLVED" });
    const done = await db.ticket.findUniqueOrThrow({ where: { id: quick.id } });
    expect(done.firstResponseAt).not.toBeNull();
    expect(done.resolvedAt).not.toBeNull();
    // A customer reply reopens it.
    await customerReply(o.deps, quick.reference, "Still broken");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: quick.id } })).resolvedAt).toBeNull();

    // Move both into a quiet month to measure them exactly.
    await db.ticket.update({ where: { id: quick.id }, data: { createdAt: at(4, 8), firstResponseAt: at(4, 8, 30), resolvedAt: at(4, 12) } });
    await db.ticket.update({ where: { id: slow.id }, data: { createdAt: at(5, 8), firstResponseAt: at(5, 11), resolvedAt: null } });
    const m = await measureMonth(db, MONTH);
    expect(m.measures).toEqual([
      { unit: "SUPPORT", priority: "URGENT", tickets: 1, firstResponse: 180, firstWithin: 0, resolve: null, resolveWithin: null },
      { unit: "SUPPORT", priority: "NORMAL", tickets: 1, firstResponse: 30, firstWithin: 100, resolve: 240, resolveWithin: 100 },
    ]);

    // Too few to publish.
    const report = await writeResponseReport(db, new Date(Date.UTC(2019, 3, 2, 6)));
    expect(report).toEqual({ month: MONTH, tickets: 2, published: false });
    expect(await publishedResponseTimes(db)).toBeNull();
  });

  it("asks for one rating per resolved ticket and publishes times only with Service standards on", async () => {
    const o = await customer("Serowe Seeds");
    const quiet = await openTicket(o.deps, { subject: "No feature", body: "Hi" });
    await customerResolve(o.deps, quiet.reference);
    expect(await db.outboundEmail.count({ where: { kind: "ticket.rating", organisationId: o.organisationId } })).toBe(0);
    await expect(rateTicket(db, { reference: quiet.reference, organisationId: o.organisationId }, { score: 5 })).rejects.toMatchObject({ code: "not-found" });

    await setFeature({ db, staff: admin }, "service-standards", true);
    const t = await openTicket(o.deps, { subject: "Printer", body: "Hi" });
    await expect(rateTicket(db, { reference: t.reference, organisationId: o.organisationId }, { score: 5 })).rejects.toMatchObject({ code: "conflict" });
    await staffReply({ db, staff: support }, t.reference, { body: "Fixed", status: "RESOLVED" });
    const sorted = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(sorted.ratingToken).toBeTruthy();
    const emails = await db.outboundEmail.findMany({ where: { kind: "ticket.rating", organisationId: o.organisationId } });
    expect(emails).toHaveLength(1);
    const rendered = await TEMPLATES["ticket.rating"](emails[0].payload as Record<string, unknown>, { db, appUrl: "https://console.example", siteUrl: "https://www.example", consoleName: "Cloud Console", now: new Date(), locale: "en-BW", timeZone: "Africa/Gaborone" });
    expect(JSON.stringify(rendered)).toContain(`https://www.example/bw/rate/${sorted.ratingToken}?score=5`);

    await expect(rateTicket(db, { token: sorted.ratingToken! }, { score: 9 })).rejects.toMatchObject({ code: "invalid" });
    await rateTicket(db, { token: sorted.ratingToken! }, { score: 4, comment: " Quick, thanks " });
    expect(await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ rating: 4, ratingComment: "Quick, thanks" });
    await expect(rateTicket(db, { token: "wrong" }, { score: 4 })).rejects.toMatchObject({ code: "not-found" });
    // Another customer's ticket can't be rated from the console.
    const other = await customer("Maun Mats");
    await expect(rateTicket(db, { reference: t.reference, organisationId: other.organisationId }, { score: 1 })).rejects.toMatchObject({ code: "not-found" });

    // Reopened and sorted again: no second email.
    await customerReply(o.deps, t.reference, "Again");
    await staffReply({ db, staff: support }, t.reference, { body: "Fixed again", status: "RESOLVED" });
    expect(await db.outboundEmail.count({ where: { kind: "ticket.rating", organisationId: o.organisationId } })).toBe(1);

    await db.responseReport.create({
      data: { month: "2019-02", tickets: 25, published: true, data: { month: "2019-02", ratings: 3, satisfaction: 4.3, measures: [
        { unit: "SUPPORT", priority: "NORMAL", tickets: 20, firstResponse: 60, firstWithin: 90, resolve: 600, resolveWithin: 80 },
        { unit: "DELIVERY", priority: "NORMAL", tickets: 5, firstResponse: 120, firstWithin: 60, resolve: null, resolveWithin: null },
      ] } },
    });
    const shown = await publishedResponseTimes(db);
    expect(shown).toMatchObject({ month: "2019-02", tickets: 25, satisfaction: 4.3, byPriority: [{ priority: "NORMAL", tickets: 25, firstResponse: 72, firstWithin: 84 }] });
  });

  it("keeps the partner register and reminds Admins once per renewal", async () => {
    const product = await db.product.findFirstOrThrow({ select: { slug: true } });
    const input = { name: "Acme Distribution", category: "Distributor", status: "ACTIVE", contacts: "Lesego, lesego@acme.example", agreementRef: "ACME-2026", agreementUrl: "http://docs.example", startsOn: "2026-01-01", renewsOn: "2025-01-01", noticeDays: "400", products: `${product.slug}, not-a-product`, notes: "" };
    await expect(savePartnerRecord({ db, staff: support }, null, input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(savePartnerRecord({ db, staff: admin }, null, input)).rejects.toMatchObject({
      fieldErrors: { agreementUrl: expect.any(String), renewsOn: expect.any(String), noticeDays: expect.any(String), products: expect.stringContaining("not-a-product") },
    });
    const name = `Acme ${uniqueEmail("p")}`;
    const now = new Date(Date.UTC(2027, 0, 1));
    const renewsOn = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
    const saved = await savePartnerRecord({ db, staff: admin }, null, { ...input, name, agreementUrl: "https://docs.example/acme", renewsOn, noticeDays: "60", products: product.slug });
    expect(saved).toMatchObject({ name, noticeDays: 60, products: [product.slug] });

    expect(await remindRenewals(db, now)).toBeGreaterThanOrEqual(1);
    const reminded = await db.outboundEmail.count({ where: { kind: "partner.renewal", payload: { path: ["partnerId"], equals: saved.id } } });
    expect(reminded).toBeGreaterThanOrEqual(1);
    await remindRenewals(db, now);
    expect(await db.outboundEmail.count({ where: { kind: "partner.renewal", payload: { path: ["partnerId"], equals: saved.id } } })).toBe(reminded);
    await db.partnerRecord.update({ where: { id: saved.id }, data: { status: "ENDED" } });
  });
});

async function staff(role: StaffActor["staffRole"]): Promise<StaffActor> {
  const user = await db.user.create({ data: { email: uniqueEmail("u7"), name: `Kagiso ${role}`, passwordHash: "x", kind: "STAFF", staffRole: role, totpEnabled: true } });
  return { userId: user.id, name: user.name, staffRole: role };
}
