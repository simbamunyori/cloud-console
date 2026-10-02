import { beforeAll, describe, expect, it } from "vitest";
import { removeRedirect, saveRedirect } from "../src/server/admin/redirects";
import { prisma as db } from "../src/server/db";
import { findRedirect, forgetRedirects, matchRedirect, normalisePath } from "../src/server/site/redirects";

const tag = Math.random().toString(36).slice(2, 8);
const publisher = { userId: "", name: "Redirect Publisher", staffRole: "ADMIN" as const, websiteRole: "PUBLISHER" as const };
const editor = { ...publisher, websiteRole: "EDITOR" as const };

beforeAll(async () => {
  const u = await db.user.create({ data: { email: `redirects-${tag}@example.co.bw`, name: "Redirect Publisher", passwordHash: "", kind: "STAFF", staffRole: "ADMIN" } as never });
  publisher.userId = u.id;
  editor.userId = u.id;
});

describe("old website addresses", () => {
  it("matches paths however they were written, and sends the rest of the old site home", () => {
    expect(normalisePath("/New/About/")).toBe("/new/about");
    expect(normalisePath("//new//web%20hosting")).toBe("/new/web hosting");
    const table = new Map([["/new/hosting", "/bw/pricing"]]);
    expect(matchRedirect("/new/hosting/", table)).toEqual({ to: "/bw/pricing", listed: true });
    expect(matchRedirect("/new/some-old-post", table)).toEqual({ to: "/", listed: false });
    expect(matchRedirect("/new", table)).toEqual({ to: "/", listed: false });
    expect(matchRedirect("/newsletter", table)).toBeNull();
    expect(matchRedirect("/bw/pricing", table)).toBeNull();
  });

  it("comes with the two old pages search engines know", async () => {
    forgetRedirects();
    const before = await db.siteRedirect.findUniqueOrThrow({ where: { fromPath: "/new/about" } });
    expect(await findRedirect("/new/")).toBe("/");
    expect(await findRedirect("/new/about/")).toBe("/");
    // Visits are counted without holding up the redirect.
    await expect.poll(async () => (await db.siteRedirect.findUniqueOrThrow({ where: { fromPath: "/new/about" } })).hits).toBeGreaterThan(before.hits);
  });

  it("lets a website Publisher add, change and remove one, audited", async () => {
    const from = `/new/services-${tag}`;
    const row = await saveRedirect(db, publisher, { fromPath: `${from.toUpperCase()}/`, toPath: "/bw/pricing" }, ["bw", "za"]);
    expect(row).toMatchObject({ fromPath: from, toPath: "/bw/pricing" });
    expect(await findRedirect(from)).toBe("/bw/pricing");
    await saveRedirect(db, publisher, { fromPath: from, toPath: "/bw/security" }, ["bw"]);
    expect(await findRedirect(from)).toBe("/bw/security");
    await removeRedirect(db, publisher, row.id);
    expect(await findRedirect(from)).toBe("/");
    const audit = await db.staffAuditEvent.findMany({ where: { actorUserId: publisher.userId }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.action)).toEqual(["redirect.saved", "redirect.saved", "redirect.removed"]);
  });

  it("refuses editors, the new site's own addresses and targets off the site", async () => {
    await expect(saveRedirect(db, editor, { fromPath: "/new/x", toPath: "/" }, ["bw"])).rejects.toMatchObject({ code: "forbidden" });
    for (const fromPath of ["/", "/bw/pricing", "/app/cart", "/sign-in", "/api/x", "new/x", "/new/x?y=1"]) {
      await expect(saveRedirect(db, publisher, { fromPath, toPath: "/" }, ["bw"]), fromPath).rejects.toMatchObject({ field: "fromPath" });
    }
    for (const toPath of ["https://evil.example", "//evil.example", "bw/pricing", "/new/x"]) {
      await expect(saveRedirect(db, publisher, { fromPath: "/new/x", toPath }, ["bw"]), toPath).rejects.toMatchObject({ field: "toPath" });
    }
  });
});
