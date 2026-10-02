import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { calendarInvite } from "../src/lib/ics";
import { money } from "../src/lib/domain/money";
import { renderPdf } from "../src/lib/pdf";
import { MemoryEmailAdapter } from "../src/server/email/adapter";
import { deliverDue } from "../src/server/email/outbox";
import { TEMPLATES } from "../src/server/email/templates";
import { captureLead, sendFollowUps, unsubscribeLead } from "../src/server/leads/capture";
import { SEQUENCES, sequenceEmail } from "../src/server/leads/sequences";
import { bookCall, bookingByToken, cancelByVisitor, freeSlots, hoursOf, saveAvailability } from "../src/server/presales/booking";
import { estimate } from "../src/server/tools/calculator";
import { CertificateError, checkEmailSecurity, cleanDomain, matchingProducts, type EmailCheckLookup } from "../src/server/tools/email-check";
import { nextSteps, QUESTIONS, readinessScore, type Answer } from "../src/server/tools/readiness";
import { claimReadiness, readinessPdf, saveReadiness } from "../src/server/tools/readiness-store";
import { safeNext } from "../src/app/(frontend)/(auth)/shared";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

const NOW = new Date("2026-10-05T08:00:00Z");

function lookup(records: Record<string, string[]>, o: Partial<EmailCheckLookup> = {}): EmailCheckLookup {
  return {
    mx: async () => [{ exchange: "acme-co-bw.mail.protection.outlook.com", priority: 0 }],
    txt: async (name) => records[name] ?? [],
    certificate: async () => ({ validTo: new Date(NOW.getTime() + 60 * 86_400_000), issuer: "Let's Encrypt" }),
    expiry: async () => new Date(NOW.getTime() + 300 * 86_400_000),
    ...o,
  };
}

describe("email security check", () => {
  it("takes a domain however it is typed, and refuses what isn't one", () => {
    expect(cleanDomain(" https://www.Acme.co.bw/contact?x=1 ")).toBe("acme.co.bw");
    expect(cleanDomain("info@acme.co.bw")).toBe("acme.co.bw");
    expect(cleanDomain("acme")).toBeNull();
    expect(cleanDomain("10.0.0.1")).toBeNull();
    expect(cleanDomain("-bad-.com")).toBeNull();
    expect(cleanDomain("acme.c0m")).toBeNull();
  });

  it("passes a domain with every record in place", async () => {
    const r = await checkEmailSecurity(
      "acme.co.bw",
      lookup({
        "acme.co.bw": ["v=spf1 include:spf.protection.outlook.com -all", "google-site-verification=x"],
        "_dmarc.acme.co.bw": ["v=DMARC1; p=reject; rua=mailto:d@acme.co.bw"],
        "selector1._domainkey.acme.co.bw": ["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ"],
      }),
      NOW,
    );
    expect(r.provider).toBe("microsoft");
    expect(r.checks.map((c) => [c.key, c.status])).toEqual([
      ["mx", "pass"],
      ["spf", "pass"],
      ["dkim", "pass"],
      ["dmarc", "pass"],
      ["certificate", "pass"],
      ["expiry", "pass"],
    ]);
    expect(r.score).toBe(100);
    expect(matchingProducts(r)).toEqual(["backup-microsoft-365"]);
  });

  it("explains each gap with its fix, and counts a warning as half", async () => {
    const r = await checkEmailSecurity(
      "acme.co.bw",
      lookup(
        { "acme.co.bw": ["v=spf1 include:spf.protection.outlook.com ?all"], "_dmarc.acme.co.bw": [] },
        { certificate: async () => Promise.reject(new CertificateError("the certificate is for a different name.")), expiry: async () => null },
      ),
      NOW,
    );
    const by = Object.fromEntries(r.checks.map((c) => [c.key, c]));
    expect(by.spf.status).toBe("warn");
    expect(by.dkim.status).toBe("warn");
    expect(by.dkim.fix).toContain("Microsoft Defender");
    expect(by.dmarc.status).toBe("fail");
    expect(by.dmarc.fix).toContain("_dmarc.acme.co.bw");
    expect(by.certificate.status).toBe("fail");
    expect(by.certificate.finding).toContain("different name");
    expect(by.expiry.status).toBe("unknown");
    // mx 1 + spf 0.5 + dkim 0.5 + dmarc 0 + certificate 0, of 5 counted.
    expect(r.score).toBe(40);
    expect(matchingProducts(r)).toContain("managed-support");
    expect(matchingProducts(r)).toContain("ssl-certificate");
  });

  it("fails SPF that lets anyone send, or comes twice, and a domain with no mail servers", async () => {
    const open = await checkEmailSecurity("a.com", lookup({ "a.com": ["v=spf1 +all"] }), NOW);
    expect(open.checks.find((c) => c.key === "spf")?.status).toBe("fail");
    const twice = await checkEmailSecurity("a.com", lookup({ "a.com": ["v=spf1 -all", "v=spf1 ~all"] }), NOW);
    expect(twice.checks.find((c) => c.key === "spf")?.finding).toContain("2 SPF records");
    const none = await checkEmailSecurity("a.com", lookup({}, { mx: async () => [] }), NOW);
    expect(none.checks[0]).toMatchObject({ key: "mx", status: "fail" });
    expect(matchingProducts(none)).toContain("microsoft-365-business-standard");
    const lapsing = await checkEmailSecurity("a.com", lookup({}, { expiry: async () => new Date(NOW.getTime() + 10 * 86_400_000) }), NOW);
    expect(lapsing.checks.find((c) => c.key === "expiry")?.status).toBe("warn");
  });

  it("treats a failed lookup as nothing found, never as an error", async () => {
    const r = await checkEmailSecurity("a.com", lookup({}, { mx: async () => Promise.reject(new Error("timeout")), txt: async () => Promise.reject(new Error("timeout")) }), NOW);
    expect(r.checks.find((c) => c.key === "mx")?.status).toBe("fail");
  });
});

describe("cost calculator", () => {
  const P = (n: bigint) => money(n, "BWP");
  const prices = [
    { slug: "microsoft-365-business-basic", name: "Microsoft 365 Business Basic", price: P(9000n) },
    { slug: "microsoft-365-business-standard", name: "Microsoft 365 Business Standard", price: P(18000n) },
    { slug: "microsoft-365-business-premium", name: "Microsoft 365 Business Premium", price: P(32000n) },
    { slug: "google-workspace-business-starter", name: "Google Workspace Business Starter", price: P(10000n) },
    { slug: "google-workspace-business-standard", name: "Google Workspace Business Standard", price: P(20000n) },
  ];

  it("recommends the lowest-priced plan that covers what they need", () => {
    const basic = estimate({ users: 10, provider: "either", needs: [] }, prices);
    expect(basic.plan?.slug).toBe("microsoft-365-business-basic");
    expect(basic.plan?.total.amountMinor).toBe(90000n);
    expect(basic.alternative?.slug).toBe("google-workspace-business-starter");
    expect(estimate({ users: 3, provider: "microsoft", needs: ["desktop"] }, prices).plan?.slug).toBe("microsoft-365-business-standard");
    expect(estimate({ users: 3, provider: "either", needs: ["security"] }, prices).plan?.slug).toBe("microsoft-365-business-premium");
    expect(estimate({ users: 3, provider: "google", needs: ["meetings"] }, prices).plan?.slug).toBe("google-workspace-business-standard");
  });

  it("never recommends a plan that isn't on sale, and sends large teams to a quote", () => {
    const g = estimate({ users: 3, provider: "google", needs: ["desktop"] }, prices);
    expect(g.plan).toBeNull();
    expect(g.note).toContain("no installed Office apps");
    expect(estimate({ users: 3, provider: "google", needs: ["security"] }, prices).plan).toBeNull();
    expect(estimate({ users: 301, provider: "either", needs: [] }, prices).note).toContain("up to 300");
  });
});

describe("data protection checklist", () => {
  const all = (a: Answer) => Object.fromEntries(QUESTIONS.map((q) => [q.key, a])) as Record<string, Answer>;

  it("scores the basics double and puts them first", () => {
    expect(readinessScore(all("yes"))).toBe(100);
    expect(readinessScore(all("no"))).toBe(0);
    expect(readinessScore(all("partly"))).toBe(50);
    const answers = { ...all("yes"), training: "no" as Answer, breach: "partly" as Answer, inventory: "no" as Answer };
    expect(nextSteps(answers).map((s) => s.key)).toEqual(["inventory", "breach", "training"]);
    expect(nextSteps(all("yes"))).toEqual([]);
  });

  it("writes a summary PDF that a reader opens", () => {
    const pdf = readinessPdf({ answers: all("no"), score: 0, createdAt: NOW }, { law: "Data Protection Act, 2024", organisation: "Kgale Hill Logistics" });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Type /Catalog");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("(Data protection readiness summary)");
    // Every object the cross-reference table points at is where it says.
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    const offsets = text
      .slice(xref)
      .split("\n")
      .slice(3)
      .filter((l) => / 00000 n $/.test(l))
      .map((l) => Number(l.slice(0, 10)));
    offsets.forEach((o, i) => expect(text.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });

  it("flows long text onto more pages and keeps brackets safe", () => {
    const pdf = renderPdf(
      Array.from({ length: 120 }, (_, i) => ({ text: `Line (${i}) with a backslash \\ and more words to wrap across the page width.` })),
      { title: "Test" },
    ).toString("latin1");
    expect((pdf.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThan(1);
    expect(pdf).toContain("\\(0\\)");
  });
});

describe("calendar invites", () => {
  it("writes an invite calendars accept, with lines folded and text escaped", () => {
    const ics = calendarInvite({
      method: "REQUEST",
      uid: "call-abc@console.example",
      sequence: 0,
      start: new Date("2026-10-06T07:00:00Z"),
      end: new Date("2026-10-06T07:30:00Z"),
      summary: "Fourth Generation Technologies: A demo of Thebe",
      description: "Line one, with a comma; and a semicolon\nLine two ".repeat(4),
      organizer: { name: "Fourth Generation Technologies", email: "sales@example.co.bw" },
      attendees: [{ name: "Kagiso Molefe", email: "kagiso@example.co.bw" }],
      now: NOW,
    });
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("DTSTART:20261006T070000Z\r\n");
    expect(ics).toContain("UID:call-abc@console.example\r\n");
    expect(ics).toContain("with a comma\\; and");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(calendarInvite({ method: "CANCEL", uid: "x", sequence: 1, start: NOW, end: NOW, summary: "s", description: "d", organizer: { name: "a", email: "a@b.co" }, attendees: [] })).toContain(
      "STATUS:CANCELLED",
    );
  });
});

describe("sign-in carries a tool's order", () => {
  it("allows a marketplace product with a quantity, and nothing else new", () => {
    expect(safeNext("/app/marketplace/microsoft-365-business-standard?quantity=12", "CUSTOMER")).toBe("/app/marketplace/microsoft-365-business-standard?quantity=12");
    expect(safeNext("/app/readiness/abc_DEF-123", "CUSTOMER")).toBe("/app/readiness/abc_DEF-123");
    expect(safeNext("/app/marketplace/x?quantity=1&next=//evil.example", "CUSTOMER")).toBe("/app");
    expect(safeNext("https://evil.example/app", "CUSTOMER")).toBe("/app");
  });
});

describe("follow-up email words", () => {
  it("has an email for every step of every sequence, and none breaks house style", () => {
    const result = {
      EMAIL_CHECK: { domain: "acme.co.bw", score: 40, checks: [{ key: "dmarc", status: "fail", title: "DMARC", finding: "No record.", fix: "Add one." }] },
      COST_CALCULATOR: { provider: "Either", users: 12, plan: { slug: "microsoft-365-business-standard", name: "Microsoft 365 Business Standard", unit: "P 180.00", total: "P 2,160.00" } },
      DPA_CHECKLIST: { token: "tok", score: 42, law: "Data Protection Act, 2024", steps: ["List what you hold."] },
    } as Record<string, unknown>;
    for (const [source, steps] of Object.entries(SEQUENCES)) {
      steps!.forEach((_, step) => {
        for (const bookingUrl of [null, "https://console.example/bw/book"]) {
          const e = sequenceEmail(source as keyof typeof SEQUENCES, step, {
            appUrl: "https://console.example",
            market: "bw",
            name: "Kagiso Molefe",
            need: "Email for 8",
            result: result[source] ?? null,
            bookingUrl,
          });
          expect(e, `${source} step ${step}`).not.toBeNull();
          const words = [e!.subject, e!.body.heading, ...e!.body.paragraphs].join(" ");
          expect(words).not.toMatch(/!|—/);
        }
      });
    }
    expect(sequenceEmail("COST_CALCULATOR", 0, { appUrl: "https://c.example", market: "bw", name: "a@b.co", need: "", result: result.COST_CALCULATOR, bookingUrl: null })?.body.button?.url).toBe(
      `https://c.example/sign-up?next=${encodeURIComponent("/app/marketplace/microsoft-365-business-standard?quantity=12")}`,
    );
  });
});

describe.skipIf(!hasDb)("leads from every source", () => {
  const ctx = () => ({ db, appUrl: "https://console.example", consoleName: "Cloud Console", now: new Date(), locale: "en-BW", timeZone: "Africa/Gaborone" });

  it("updates the same person's lead, keeps each visit, and sends the tool's result at once", async () => {
    const email = uniqueEmail("lead");
    const touch = { campaign: "launch-m365", source: "linkedin", medium: "social" };
    const first = await db.$transaction((tx) =>
      captureLead(tx, {
        market: "bw",
        source: "EMAIL_CHECK",
        tool: "email-check",
        email,
        need: "Checked acme.co.bw",
        consentText: "ok",
        followUps: true,
        touch,
        toolResult: { domain: "acme.co.bw", score: 40, checks: [] },
      }),
    );
    expect(first).toMatchObject({ source: "EMAIL_CHECK", tool: "email-check", campaign: "launch-m365", campaignSource: "linkedin", followUp: "EMAIL_CHECK", followUpStep: 1, name: email });
    const queued = await db.outboundEmail.findMany({ where: { kind: "lead.follow-up", payload: { path: ["leadId"], equals: first.id } } });
    expect(queued).toHaveLength(1);
    const rendered = await TEMPLATES["lead.follow-up"](queued[0].payload as Record<string, unknown>, ctx());
    expect(rendered?.subject).toBe("Your email security report for acme.co.bw");
    expect(rendered?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(rendered?.body.footnote).toContain(`/bw/unsubscribe/`);

    const again = await db.$transaction((tx) =>
      captureLead(tx, {
        market: "bw",
        source: "COST_CALCULATOR",
        tool: "cost-calculator",
        name: "Kagiso Molefe",
        email: email.toUpperCase(),
        need: "Priced 12 people",
        consentText: "ok",
        followUps: true,
        toolResult: { users: 12 },
      }),
    );
    expect(again.id).toBe(first.id);
    expect(again).toMatchObject({ name: "Kagiso Molefe", source: "COST_CALCULATOR", followUp: "COST_CALCULATOR" });
    expect(again.need).toContain("Earlier: Checked acme.co.bw");
    expect(await db.leadTouch.count({ where: { leadId: first.id } })).toBe(2);
  });

  it("sends the next step when due, and stops for good on unsubscribe", async () => {
    const email = uniqueEmail("seq");
    const lead = await db.$transaction((tx) => captureLead(tx, { market: "bw", source: "NEWSLETTER", tool: "newsletter", email, need: "Signed up", consentText: "ok", followUps: true }));
    expect(lead.followUpStep).toBe(0);
    expect(await sendFollowUps(db, new Date(), { id: lead.id })).toBe(0);
    expect(await sendFollowUps(db, new Date(Date.now() + 3 * 86_400_000), { id: lead.id })).toBe(1);
    const after = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after).toMatchObject({ followUpStep: 1, followUpStopped: "finished" });

    const other = await db.$transaction((tx) => captureLead(tx, { market: "bw", source: "QUOTE", email, need: "Quote", consentText: "ok", followUps: true }));
    await unsubscribeLead(db, other.unsubscribeToken!);
    await unsubscribeLead(db, other.unsubscribeToken!);
    expect(await db.lead.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ followUpStopped: "unsubscribed", followUpAt: null });
    expect(await sendFollowUps(db, new Date(Date.now() + 30 * 86_400_000), { id: other.id })).toBe(0);
  });

  it("stops when the person has ordered", async () => {
    const org = await makeOrganisation("Funnel Buyers");
    const product = await db.product.findFirstOrThrow({ where: { slug: "microsoft-365-business-basic" } });
    const placedById = (await db.membership.findFirstOrThrow({ where: { organisationId: org.organisationId } })).userId;
    await db.order.create({
      data: {
        reference: `ORD-${randomBytes(3).toString("hex").toUpperCase()}`,
        organisationId: org.organisationId,
        productId: product.id,
        status: "ACTIVE",
        quantity: 1,
        unitPriceMinor: 100n,
        monthlyTotalMinor: 100n,
        currency: "BWP",
        expectedBy: new Date(),
        placedById,
      },
    });
    const lead = await db.$transaction((tx) => captureLead(tx, { market: "bw", source: "QUOTE", email: org.email, need: "Quote", consentText: "ok", followUps: true }));
    expect(await sendFollowUps(db, new Date(Date.now() + 10 * 86_400_000), { id: lead.id })).toBe(0);
    expect(await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ followUpStopped: "bought", followUpAt: null });
  });
});

describe.skipIf(!hasDb)("pre-sales bookings", () => {
  async function engineer() {
    // Engineers from earlier runs would share the times.
    await db.presalesEngineer.updateMany({ where: { user: { name: "Lorato Engineer" } }, data: { active: false } });
    const user = await db.user.create({ data: { email: uniqueEmail("presales"), name: "Lorato Engineer", passwordHash: "x", kind: "STAFF", staffRole: "SUPPORT" } });
    const staff = { userId: user.id, name: user.name, staffRole: "SUPPORT" as const };
    // A Sunday afternoon nobody else works, so other suites' engineers don't share the times.
    await saveAvailability(db, staff, { active: true, meetingUrl: "https://teams.example/l/lorato", hours: [{ day: 7, from: "13:00", to: "14:00" }], timeZone: "Africa/Gaborone" });
    return { user, staff };
  }
  // Their Sunday hours would otherwise show on the booking page of a dev server.
  afterEach(async () => {
    await db.presalesEngineer.updateMany({ where: { user: { name: "Lorato Engineer" } }, data: { active: false } });
  });
  // Sunday 4 October 2026, 08:00 in Gaborone.
  const now = new Date("2026-10-04T06:00:00Z");

  it("offers the free half-hours and books one with invites to both sides", async () => {
    const { user } = await engineer();
    const days = await freeSlots(db, "Africa/Gaborone", now);
    const sunday = days.find((d) => d.day === "2026-10-04");
    expect(sunday?.slots.map((s) => s.label)).toEqual(expect.arrayContaining(["13:00", "13:30"]));
    const start = sunday!.slots.find((s) => s.label === "13:00")!.start;

    const input = { start, topic: "thebe", name: "Kagiso Molefe", email: uniqueEmail("visitor"), company: "Kgale Hill", consent: true };
    await expect(bookCall(db, { code: "bw", timeZone: "Africa/Gaborone" }, { ...input, consent: false }, { now })).rejects.toMatchObject({ fieldErrors: { consent: expect.any(String) } });
    // A sequence already running for them stops once they book.
    await db.$transaction((tx) =>
      captureLead(tx, { market: "bw", source: "EMAIL_CHECK", tool: "email-check", email: input.email, need: "Checked kgale.example", consentText: "test", followUps: true }, now),
    );
    const booking = await bookCall(db, { code: "bw", timeZone: "Africa/Gaborone" }, input, { now });
    expect(booking).toMatchObject({ topic: "thebe", status: "BOOKED", endsAt: new Date(new Date(start).getTime() + 30 * 60_000) });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: booking.leadId! } });
    expect(lead).toMatchObject({ followUpStopped: "booked", followUpAt: null });

    const mail = new MemoryEmailAdapter();
    await deliverDue(db, mail, new Date(), 10, { kind: "booking.invite", payload: { path: ["bookingId"], equals: booking.id } });
    const toVisitor = mail.sent.find((m) => m.to === input.email)!;
    const toEngineer = mail.sent.find((m) => m.to === user.email)!;
    expect(toVisitor.calendar?.method).toBe("REQUEST");
    expect(toVisitor.calendar?.content).toContain(`ATTENDEE;CN="Lorato Engineer"`);
    expect(toVisitor.calendar?.content).toContain("LOCATION:https://teams.example/l/lorato");
    expect(toEngineer.subject).toContain("Kagiso Molefe");

    // The same time is gone, for this engineer and for anyone else asking.
    expect((await freeSlots(db, "Africa/Gaborone", now)).find((d) => d.day === "2026-10-04")?.slots.some((s) => s.start === start && s.label === "13:00")).toBeFalsy();
    await expect(bookCall(db, { code: "bw", timeZone: "Africa/Gaborone" }, { ...input, email: uniqueEmail("late") }, { now })).rejects.toMatchObject({ field: "start" });

    // The visitor's email carries a fresh cancel link; cancelling tells both sides.
    const token = decodeURIComponent(/book\/cancel\/([^\s]+)/.exec(toVisitor.text)![1]);
    expect((await bookingByToken(db, token))?.id).toBe(booking.id);
    await cancelByVisitor(db, token, now);
    const cancelled = new MemoryEmailAdapter();
    await deliverDue(db, cancelled, new Date(), 10, { kind: "booking.cancelled", payload: { path: ["bookingId"], equals: booking.id } });
    expect(cancelled.sent).toHaveLength(2);
    expect(cancelled.sent[0].calendar?.method).toBe("CANCEL");
    expect(cancelled.sent[0].calendar?.content).toContain("SEQUENCE:1");
  });

  it("checks staff hours", async () => {
    const { staff } = await engineer();
    await expect(saveAvailability(db, staff, { active: true, meetingUrl: "", hours: [{ day: 1, from: "15:00", to: "09:00" }], timeZone: "Africa/Gaborone" })).rejects.toThrow("start before its end");
    await expect(saveAvailability(db, staff, { active: true, meetingUrl: "http://insecure.example", hours: [], timeZone: "Africa/Gaborone" })).rejects.toThrow("https://");
    expect(
      hoursOf([
        { day: 8, from: "09:00", to: "10:00" },
        { day: 1, from: "09:00", to: "10:00" },
      ]),
    ).toEqual([{ day: 1, from: "09:00", to: "10:00" }]);
  });
});

describe.skipIf(!hasDb)("readiness checklist", () => {
  it("is kept for the first organisation that opens it, and nobody else", async () => {
    const answers = Object.fromEntries(QUESTIONS.map((q) => [q.key, "partly"])) as Record<string, Answer>;
    const row = await saveReadiness(db, "bw", answers);
    expect(row.score).toBe(50);
    const a = await makeOrganisation("Readiness One");
    const b = await makeOrganisation("Readiness Two");
    expect((await claimReadiness(db, row.token, a.organisationId))?.organisationId).toBe(a.organisationId);
    expect(await claimReadiness(db, row.token, b.organisationId)).toBeNull();
    expect(await claimReadiness(db, "nope", a.organisationId)).toBeNull();
  });
});
