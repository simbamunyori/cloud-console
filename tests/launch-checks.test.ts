import { describe, expect, it, vi } from "vitest";
import { prisma as db } from "../src/server/db";
import { launchChecks } from "../src/server/launch/checks";

// Outside a request: published content only, as staff see it on the page.
vi.mock("next/headers", () => ({ draftMode: async () => ({ isEnabled: false }), headers: async () => new Headers(), cookies: async () => ({ toString: () => "" }) }));

describe("launch checks", () => {
  it("list the site address, backups, the allowlist and every enabled market's legal pages", async () => {
    const { placeholders, checks } = await launchChecks(db);
    expect(Array.isArray(placeholders)).toBe(true);
    const keys = checks.map((c) => c.key);
    expect(keys.slice(0, 3)).toEqual(["site-url", "offsite", "allowlist"]);
    for (const m of await db.market.findMany({ where: { enabled: true } })) {
      for (const kind of ["terms", "privacy", "refunds", "service-providers", "data-protection"]) expect(keys).toContain(`legal-${m.code}-${kind}`);
    }
    expect(checks.find((c) => c.key === "site-url")!.done).toBe(Boolean(process.env.SITE_URL));
    for (const c of checks) expect(c.detail).not.toMatch(/!|—/);
  });
});
