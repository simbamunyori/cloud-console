import type { SessionStage, StaffRole, UserKind, WebsiteRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../src/server/auth/cookies";
import { hashToken, newToken } from "../src/server/auth/tokens";
import { announcementLive, forMarket } from "../src/server/site/proof";
import { FIRST_REPLY_MIN_TICKETS, formatReplyTime, medianFirstReply, medianFirstReplyMinutes } from "../src/server/support/first-reply";
import { db, hasDb, makeOrganisation, uniqueEmail } from "./helpers";

const MIN = 60_000;

describe("the median first reply", () => {
  it("hides with fewer than 30 answered tickets, and takes the middle wait after that", () => {
    expect(medianFirstReplyMinutes(Array.from({ length: FIRST_REPLY_MIN_TICKETS - 1 }, () => 5 * MIN))).toBeNull();
    const waits = Array.from({ length: 31 }, (_, i) => (i + 1) * MIN); // 1 to 31 minutes
    expect(medianFirstReplyMinutes(waits)).toBe(16);
    expect(medianFirstReplyMinutes([...waits.slice(0, 30)])).toBe(16); // (15 + 16) / 2, rounded
    expect(medianFirstReplyMinutes(Array.from({ length: 30 }, () => 5_000))).toBe(1); // never "0 min"
  });

  it("reads in minutes, hours or days", () => {
    expect(formatReplyTime(12)).toBe("12 min");
    expect(formatReplyTime(12, "long")).toBe("12 minutes");
    expect(formatReplyTime(1, "long")).toBe("1 minute");
    expect(formatReplyTime(70)).toBe("1 hour");
    expect(formatReplyTime(185)).toBe("3 hours");
    expect(formatReplyTime(60 * 72)).toBe("3 days");
  });
});

describe("proof for a market", () => {
  it("shows items for every market or this one", () => {
    const docs = [
      { id: 1, markets: [] },
      { id: 2, markets: ["za"] },
      { id: 3, markets: null },
      { id: 4, markets: ["bw", "za"] },
    ];
    expect(forMarket(docs, "bw").map((d) => d.id)).toEqual([1, 3, 4]);
    expect(forMarket(docs, "za").map((d) => d.id)).toEqual([1, 2, 3, 4]);
  });

  it("shows the announcement only with words, in its market and between its dates", () => {
    const now = new Date("2026-10-01T08:00:00Z");
    expect(announcementLive({ text: "Closed on Friday" }, "bw", now)).toBe(true);
    expect(announcementLive({ text: "  " }, "bw", now)).toBe(false);
    expect(announcementLive(null, "bw", now)).toBe(false);
    expect(announcementLive({ text: "x", markets: ["za"] }, "bw", now)).toBe(false);
    expect(announcementLive({ text: "x", markets: ["za"] }, "za", now)).toBe(true);
    expect(announcementLive({ text: "x", startsAt: "2026-10-02T00:00:00Z" }, "bw", now)).toBe(false);
    expect(announcementLive({ text: "x", endsAt: "2026-10-01T08:00:00Z" }, "bw", now)).toBe(false);
    expect(announcementLive({ text: "x", startsAt: "2026-09-30T00:00:00Z", endsAt: "2026-10-02T00:00:00Z" }, "bw", now)).toBe(true);
  });
});

describe.skipIf(!hasDb)("the median first reply from support tickets", () => {
  it("counts the first reply the customer saw, ignores staff notes and old tickets", async () => {
    const future = new Date("2099-01-01T12:00:00Z"); // A window no other test's tickets fall in.
    const { organisationId, owner } = await makeOrganisation("First Reply Tests");
    const org = { id: organisationId };
    const user = { id: owner.userId };
    const ticket = async (openedMinutesAgo: number, replies: { after: number; internal?: boolean }[]) => {
      const createdAt = new Date(future.getTime() - openedMinutesAgo * MIN);
      const t = await db.ticket.create({ data: { reference: `FR-${Math.random().toString(36).slice(2, 10)}`, organisationId: org.id, subject: "Help", openedById: user.id, createdAt } });
      for (const r of replies) {
        await db.ticketMessage.create({
          data: {
            organisationId: org.id,
            ticketId: t.id,
            authorKind: "STAFF",
            authorLabel: "Support",
            body: "Hi",
            internal: r.internal ?? false,
            createdAt: new Date(createdAt.getTime() + r.after * MIN),
          },
        });
      }
    };
    try {
      for (let i = 0; i < 29; i++) await ticket(1000, [{ after: 1, internal: true }, { after: 10 }]);
      await ticket(1000, []); // not answered yet: doesn't count
      await ticket(200 * 24 * 60, [{ after: 1 }]); // older than 90 days
      expect(await medianFirstReply(db, future)).toBeNull();
      await ticket(1000, [{ after: 10 }, { after: 20 }]);
      expect(await medianFirstReply(db, future)).toBe(10);
    } finally {
      await db.ticketMessage.deleteMany({ where: { organisationId: org.id } });
      await db.ticket.deleteMany({ where: { organisationId: org.id } });
    }
  });
});

describe.skipIf(!hasDb || !process.env.PAYLOAD_SECRET)("proof in the website editor (Payload)", () => {
  type Payload = Awaited<ReturnType<typeof import("payload").getPayload>>;
  let payload: Payload;
  const TOTP = process.env.TOTP_ENCRYPTION_KEY;

  async function signedIn(role: WebsiteRole, staffRole: StaffRole = "SUPPORT", kind: UserKind = "STAFF", stage: SessionStage = "ACTIVE") {
    const user = await db.user.create({ data: { kind, email: uniqueEmail("proof"), name: `Proof ${role.toLowerCase()}`, passwordHash: "x", totpEnabled: true, staffRole, websiteRole: role } });
    const token = newToken();
    await db.session.create({ data: { tokenHash: hashToken(token), userId: user.id, audience: kind, stage, expiresAt: new Date(Date.now() + 3_600_000) } });
    return (await payload.auth({ headers: new Headers({ cookie: `${SESSION_COOKIE[kind]}=${token}` }) })).user!;
  }

  beforeAll(async () => {
    process.env.TOTP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    const [{ getPayload }, { default: config }] = await Promise.all([import("payload"), import("../src/payload.config")]);
    payload = await getPayload({ config });
  }, 60_000);
  afterAll(async () => {
    await payload.delete({ collection: "partners", where: { name: { like: "Test partner" } }, overrideAccess: true });
    process.env.TOTP_ENCRYPTION_KEY = TOTP;
  });

  it("lets Editors add proof but only Publishers approve it, and records each change", async () => {
    const editor = await signedIn("EDITOR");
    const pub = await signedIn("PUBLISHER");
    const as = (user: typeof editor) => ({ user, overrideAccess: false });

    // An Editor's tick is ignored: the box is a Publisher's.
    const added = await payload.create({ collection: "partners", data: { name: "Test partner one", badge: "Test badge", approved: true }, ...as(editor) });
    expect(added.approved).toBe(false);
    const edited = await payload.update({ collection: "partners", id: added.id, data: { approved: true, badge: "Test badge two" }, ...as(editor) });
    expect(edited).toMatchObject({ approved: false, badge: "Test badge two" });
    await expect(payload.delete({ collection: "partners", id: added.id, ...as(editor) })).rejects.toThrow();

    const approved = await payload.update({ collection: "partners", id: added.id, data: { approved: true }, ...as(pub) });
    expect(approved.approved).toBe(true);
    const events = await db.staffAuditEvent.findMany({ where: { action: { startsWith: "website.partner-" }, data: { path: ["id"], equals: added.id } } });
    expect(events.map((e) => e.action).sort()).toEqual(["website.partner-added", "website.partner-changed", "website.partner-changed"]);

    // Visitors never read the lists directly; the site reads them on the server.
    await expect(payload.find({ collection: "partners", overrideAccess: false })).rejects.toThrow();
  });

  it("keeps the announcement bar to Publishers", async () => {
    const editor = await signedIn("EDITOR");
    const pub = await signedIn("PUBLISHER");
    await expect(payload.updateGlobal({ slug: "announcement", data: { text: "Test" }, user: editor, overrideAccess: false })).rejects.toThrow();
    const saved = await payload.updateGlobal({ slug: "announcement", data: { text: "" }, user: pub, overrideAccess: false });
    expect(saved.text ?? "").toBe("");
  });
});
