import type { SessionStage, StaffRole, UserKind, WebsiteRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "../src/server/auth/cookies";
import { hashToken, newToken } from "../src/server/auth/tokens";
import { looksLikePrice, PRICE_MESSAGE } from "../src/cms/no-prices";
import { websiteStaffFromCookies } from "../src/server/cms/staff-session";
import type { StaffActor } from "../src/server/staff/access";
import { setWebsiteRole, staffList } from "../src/server/staff/website-roles";
import { db, hasDb, testDeps, uniqueEmail } from "./helpers";

async function person(kind: UserKind, staffRole: StaffRole | null, websiteRole: WebsiteRole | null, stage: SessionStage = "ACTIVE") {
  const user = await db.user.create({
    data: { kind, email: uniqueEmail("web"), name: `Kagiso ${kind.toLowerCase()}`, passwordHash: "x", totpEnabled: true, staffRole, websiteRole },
  });
  const token = newToken();
  await db.session.create({ data: { tokenHash: hashToken(token), userId: user.id, audience: kind, stage, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { user, cookie: `other=1; ${SESSION_COOKIE[kind]}=${token}` };
}

const actor = (u: { id: string; name: string; staffRole: StaffRole | null }): StaffActor => ({ userId: u.id, name: u.name, staffRole: u.staffRole! });

describe("the price guardrail", () => {
  it("finds amounts of money in any of our currencies, and leaves other numbers alone", () => {
    for (const t of ["P 120", "from P99 a month", "R 1,299", "$15", "US$ 12.50", "120 BWP", "40 pula", "ZAR 300", "(P120)"]) expect(looksLikePrice(t), t).toBe(true);
    for (const t of ["Microsoft 365", "24/7 support", "Page 2 of 3", "Plan B", "PR 2", "99.9% uptime", "Windows Server 2025"]) expect(looksLikePrice(t), t).toBe(false);
  });
});

describe.skipIf(!hasDb)("website editor sign-in", () => {
  it("lets in only fully signed-in staff with a website role", async () => {
    const deps = testDeps();
    const editor = await person("STAFF", "SUPPORT", "EDITOR");
    const admin = await person("STAFF", "ADMIN", null);
    const none = await person("STAFF", "FINANCE", null);
    const halfway = await person("STAFF", "SUPPORT", "PUBLISHER", "CODE_PENDING");
    const customer = await person("CUSTOMER", null, "PUBLISHER");

    expect(await websiteStaffFromCookies(deps, editor.cookie)).toMatchObject({ userId: editor.user.id, websiteRole: "EDITOR" });
    expect(await websiteStaffFromCookies(deps, admin.cookie)).toMatchObject({ websiteRole: "PUBLISHER" });
    expect(await websiteStaffFromCookies(deps, none.cookie)).toBeNull();
    expect(await websiteStaffFromCookies(deps, halfway.cookie)).toBeNull();
    expect(await websiteStaffFromCookies(deps, customer.cookie)).toBeNull();
    expect(await websiteStaffFromCookies(deps, "")).toBeNull();

    await db.user.update({ where: { id: editor.user.id }, data: { deactivatedAt: new Date() } });
    expect(await websiteStaffFromCookies(deps, editor.cookie)).toBeNull();
  });
});

describe.skipIf(!hasDb)("website roles", () => {
  it("lets only admins give website roles, and records each change", async () => {
    const admin = await person("STAFF", "ADMIN", null);
    const support = await person("STAFF", "SUPPORT", null);
    const other = await person("STAFF", "FINANCE", null);

    await expect(setWebsiteRole(db, actor(support.user), other.user.id, "PUBLISHER")).rejects.toMatchObject({ code: "forbidden" });
    await setWebsiteRole(db, actor(admin.user), other.user.id, "EDITOR");
    expect((await db.user.findUniqueOrThrow({ where: { id: other.user.id } })).websiteRole).toBe("EDITOR");
    const event = await db.staffAuditEvent.findFirstOrThrow({ where: { action: "staff.website-role", actorUserId: admin.user.id }, orderBy: { createdAt: "desc" } });
    expect(event).toMatchObject({ summary: `Gave ${other.user.name} the Editor website role`, data: { userId: other.user.id, from: null, to: "EDITOR" } });

    await setWebsiteRole(db, actor(admin.user), other.user.id, "NONE");
    expect((await db.user.findUniqueOrThrow({ where: { id: other.user.id } })).websiteRole).toBeNull();

    await expect(setWebsiteRole(db, actor(admin.user), admin.user.id, "EDITOR")).rejects.toMatchObject({ field: "websiteRole" });
    await expect(setWebsiteRole(db, actor(admin.user), other.user.id, "OWNER")).rejects.toMatchObject({ field: "websiteRole" });
    const list = await staffList(db, actor(admin.user));
    expect(list.find((p) => p.id === admin.user.id)?.effectiveWebsiteRole).toBe("PUBLISHER");
    await expect(staffList(db, actor(support.user))).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe.skipIf(!hasDb || !process.env.PAYLOAD_SECRET)("the website editor (Payload)", () => {
  type Payload = Awaited<ReturnType<typeof import("payload").getPayload>>;
  let payload: Payload;
  const TOTP = process.env.TOTP_ENCRYPTION_KEY;

  beforeAll(async () => {
    // The sign-in strategy reads sessions with the console's own key.
    process.env.TOTP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    const [{ getPayload }, { default: config }] = await Promise.all([import("payload"), import("../src/payload.config")]);
    payload = await getPayload({ config });
  }, 60_000);
  afterAll(() => {
    process.env.TOTP_ENCRYPTION_KEY = TOTP;
  });

  it("signs staff in with their console session and keeps their role in step", async () => {
    const editor = await person("STAFF", "PROVISIONING", "EDITOR");
    const { user } = await payload.auth({ headers: new Headers({ cookie: editor.cookie }) });
    expect(user).toMatchObject({ collection: "staff", consoleUserId: editor.user.id, websiteRole: "EDITOR" });

    await db.user.update({ where: { id: editor.user.id }, data: { websiteRole: "PUBLISHER" } });
    expect((await payload.auth({ headers: new Headers({ cookie: editor.cookie }) })).user).toMatchObject({ websiteRole: "PUBLISHER" });

    const none = await person("STAFF", "SUPPORT", null);
    expect((await payload.auth({ headers: new Headers({ cookie: none.cookie }) })).user).toBeNull();
    const customer = await person("CUSTOMER", null, null);
    expect((await payload.auth({ headers: new Headers({ cookie: customer.cookie }) })).user).toBeNull();
  });

  it("never lets anyone edit staff records from the editor, and keeps deleting images to Publishers", async () => {
    const pub = await person("STAFF", "SUPPORT", "PUBLISHER");
    const { user } = await payload.auth({ headers: new Headers({ cookie: pub.cookie }) });
    await expect(payload.create({ collection: "staff", data: { consoleUserId: "x", name: "x", email: "x@example.co.bw", websiteRole: "PUBLISHER" }, user: user!, overrideAccess: false })).rejects.toThrow();
    await expect(payload.update({ collection: "staff", id: user!.id, data: { websiteRole: "EDITOR" }, user: user!, overrideAccess: false })).rejects.toThrow();

    const ed = await person("STAFF", "SUPPORT", "EDITOR");
    const editor = (await payload.auth({ headers: new Headers({ cookie: ed.cookie }) })).user!;
    const media = payload.collections.media.config.access;
    expect(await media.delete!({ req: { user: editor } } as never)).toBe(false);
    expect(await media.delete!({ req: { user } } as never)).toBe(true);
    expect(await media.create!({ req: { user: editor } } as never)).toBe(true);
    expect(await media.create!({ req: { user: null } } as never)).toBe(false);
  });

  describe("pages", () => {
    const signedIn = async (role: WebsiteRole) => {
      const p = await person("STAFF", "SUPPORT", role);
      return (await payload.auth({ headers: new Headers({ cookie: p.cookie }) })).user!;
    };
    const layout = (heading: string) => [{ blockType: "callToAction" as const, heading, tone: "plain" as const }];
    const slug = () => `test-${Math.random().toString(36).slice(2, 10)}`;
    afterAll(async () => {
      await payload.delete({ collection: "pages", where: { slug: { like: "test-" } } });
    });

    it("lets Editors save drafts but only Publishers publish, unpublish, restore or delete", async () => {
      const editor = await signedIn("EDITOR");
      const pub = await signedIn("PUBLISHER");
      const as = (user: typeof editor) => ({ user, overrideAccess: false });

      await expect(payload.create({ collection: "pages", data: { title: "About", slug: slug(), layout: layout("Hello"), _status: "published" }, ...as(editor) })).rejects.toThrow();
      const draft = await payload.create({ collection: "pages", draft: true, data: { title: "About", slug: slug(), layout: layout("Hello") }, ...as(editor) });
      expect(draft._status).toBe("draft");
      await payload.update({ collection: "pages", id: draft.id, draft: true, data: { layout: layout("Hello again") }, ...as(editor) });
      await expect(payload.update({ collection: "pages", id: draft.id, data: { _status: "published" }, ...as(editor) })).rejects.toThrow();

      const live = await payload.update({ collection: "pages", id: draft.id, data: { _status: "published" }, ...as(pub) });
      expect(live._status).toBe("published");
      const event = await db.staffAuditEvent.findFirstOrThrow({ where: { action: "website.page-published", actorUserId: pub.consoleUserId }, orderBy: { createdAt: "desc" } });
      expect(event.summary).toBe("Published the page About");

      // Writing the live page without a draft is unpublishing.
      await expect(payload.update({ collection: "pages", id: draft.id, data: { _status: "draft" }, ...as(editor) })).rejects.toThrow();
      const versions = await payload.findVersions({ collection: "pages", where: { parent: { equals: draft.id } }, limit: 5 });
      await expect(payload.restoreVersion({ collection: "pages", id: versions.docs.at(-1)!.id, ...as(editor) })).rejects.toThrow();
      await expect(payload.delete({ collection: "pages", id: draft.id, ...as(editor) })).rejects.toThrow();
      await payload.delete({ collection: "pages", id: draft.id, ...as(pub) });
    });

    it("shows visitors only published pages, and staff the drafts", async () => {
      const editor = await signedIn("EDITOR");
      const s = slug();
      await payload.create({ collection: "pages", draft: true, data: { title: "Draft", slug: s, layout: layout("Not yet") }, user: editor, overrideAccess: false });
      const visitor = await payload.find({ collection: "pages", where: { slug: { equals: s } }, overrideAccess: false });
      expect(visitor.docs).toHaveLength(0);
      const staff = await payload.find({ collection: "pages", where: { slug: { equals: s } }, draft: true, user: editor, overrideAccess: false });
      expect(staff.docs).toHaveLength(1);
    });

    it("won't publish a page with a price typed into it", async () => {
      const pub = await signedIn("PUBLISHER");
      const draft = await payload.create({ collection: "pages", draft: true, data: { title: "Deal", slug: slug(), layout: layout("Only P 120 a month") } });
      const priceError = { data: { errors: [expect.objectContaining({ message: PRICE_MESSAGE })] } };
      await expect(payload.update({ collection: "pages", id: draft.id, data: { _status: "published" }, user: pub, overrideAccess: false })).rejects.toMatchObject(priceError);
      await expect(payload.create({ collection: "pages", data: { title: "Deal", slug: slug(), layout: [{ blockType: "hero", heading: "From R99", domainSearch: false, picture: { source: "console-home" } }], _status: "published" } })).rejects.toMatchObject(priceError);
    });

    it("shows Botswana's words in a market that has none of its own", async () => {
      const s = slug();
      const page = await payload.create({ collection: "pages", locale: "bw", data: { title: "Local", slug: s, layout: layout("Dumela"), _status: "published" } });
      const za = await payload.findByID({ collection: "pages", id: page.id, locale: "za", fallbackLocale: "bw" });
      expect(za.layout?.[0]).toMatchObject({ heading: "Dumela" });
      await payload.update({ collection: "pages", id: page.id, locale: "za", data: { layout: layout("Sawubona"), _status: "published" } });
      expect((await payload.findByID({ collection: "pages", id: page.id, locale: "za" })).layout?.[0]).toMatchObject({ heading: "Sawubona" });
      expect((await payload.findByID({ collection: "pages", id: page.id, locale: "bw" })).layout?.[0]).toMatchObject({ heading: "Dumela" });
    });

    it("lets only Publishers schedule a publish", async () => {
      const editor = await signedIn("EDITOR");
      const pub = await signedIn("PUBLISHER");
      const page = await payload.create({ collection: "pages", draft: true, data: { title: "Later", slug: slug(), layout: layout("Soon") } });
      const schedule = (user: typeof editor) =>
        payload.jobs.queue({ task: "schedulePublish", waitUntil: new Date(Date.now() + 86_400_000), input: { type: "publish", doc: { relationTo: "pages", value: page.id }, user: { relationTo: "staff", value: user.id } } });
      await expect(schedule(editor)).rejects.toThrow(/Only Publishers/);
      await expect(schedule(pub)).resolves.toBeTruthy();
    });
  });
});
