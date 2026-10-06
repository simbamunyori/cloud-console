import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inPillarOrder, isPillarOrdered, pillarRank } from "../src/cms/pillars";
import { DEFAULT_FOOTER, DEFAULT_HEADER } from "../src/cms/seed-frame";
import { homeLayout, WHO_WE_HELP } from "../src/cms/seed-home";
import { SUPPORTING_LINE } from "../src/config/positioning";
import { parseTheme, themeAttribute } from "../src/lib/theme";
import { hasDb } from "./helpers";

/** docs/STRATEGY_ROLLOUT.md, U2: positioning on the site and the navy theme as the default. */

describe("the navy theme as the default", () => {
  it("gives the navy theme to a visitor who hasn't chosen, and keeps a choice", () => {
    expect(parseTheme(undefined)).toBe("dark");
    expect(parseTheme("nonsense")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBe("system");
    expect(themeAttribute(parseTheme(undefined))).toBe("dark");
  });
});

describe("the pillar order", () => {
  const titles = ["Domains", "Email and Microsoft 365", "Websites and stores", "Security", "Cloud hosting and backup", "Expense management"];

  it("puts cloud and productivity, security, resilience, digital growth and business apps in that order", () => {
    expect(inPillarOrder(titles, (t) => t)).toEqual(["Email and Microsoft 365", "Security", "Cloud hosting and backup", "Domains", "Websites and stores", "Expense management"]);
  });

  it("leaves rows that aren't pillars in their places", () => {
    const menus = ["Domains", "Email", "Our own menu", "Security", "Support"];
    expect(inPillarOrder(menus, (t) => t)).toEqual(["Email", "Security", "Our own menu", "Domains", "Support"]);
    expect(pillarRank("Support")).toBeNull();
    expect(isPillarOrdered(["Email", "Security", "Support"], (t) => t)).toBe(true);
  });

  it("is how the designed header, footer and home page start", () => {
    expect(DEFAULT_HEADER.menus.map((m) => m.label)).toEqual(["Email", "Security", "Hosting and backup", "Domains", "Websites", "Expense management", "Support"]);
    const footer = DEFAULT_FOOTER.columns.find((c) => c.heading === "What we look after")!;
    expect(isPillarOrdered(footer.links, (r) => r.link.label)).toBe(true);
    const services = homeLayout("bw").find((b) => b.blockType === "numberedServices") as { items: { title: string }[] };
    expect(services.items[0].title).toBe("Email and Microsoft 365");
  });
});

describe("the home page's new words", () => {
  it("has the supporting line under the hero, and Who we help after What we look after, not yet approved", () => {
    const layout = homeLayout("bw");
    expect(layout.find((b) => b.blockType === "homeHero")).toMatchObject({
      supporting: SUPPORTING_LINE,
    });
    const at = layout.findIndex((b) => b.blockType === "numberedServices");
    expect(layout[at + 1]).toMatchObject({
      blockType: "whoWeHelp",
      approved: false,
    });
    const who = WHO_WE_HELP() as { items: { title: string }[] };
    expect(who.items.map((i) => i.title)).toEqual(["Businesses of 10 to 150 people", "Professional services", "Schools and colleges", "Contractors"]);
  });
});

describe.skipIf(!hasDb)("bringing the live site's content up to date", () => {
  type Payload = Awaited<ReturnType<typeof import("payload").getPayload>>;
  let payload: Payload;
  let homeId: number | string;
  let saved: { layout: unknown; menus: unknown };

  beforeAll(async () => {
    const [{ getPayload }, { default: config }] = await Promise.all([import("payload"), import("../src/payload.config")]);
    payload = await getPayload({ config });
    const { seedWebsite } = await import("../src/cms/seed");
    await seedWebsite(payload);
    homeId = (
      await payload.find({
        collection: "pages",
        where: { slug: { equals: "home" } },
        limit: 1,
        depth: 0,
      })
    ).docs[0].id;
    const home = await payload.findByID({
      collection: "pages",
      id: homeId,
      locale: "bw",
      fallbackLocale: false,
      depth: 0,
    });
    saved = {
      layout: home.layout,
      menus: (await payload.findGlobal({ slug: "header", locale: "bw", depth: 0 })).menus,
    };
  }, 60_000);

  afterAll(async () => {
    // Back to the content as it was, as the other tests expect it.
    await payload.update({
      collection: "pages",
      id: homeId,
      locale: "bw",
      data: { layout: saved.layout as never, _status: "published" },
    });
    await payload.updateGlobal({
      slug: "header",
      locale: "bw",
      data: { menus: saved.menus as never, _status: "published" },
    });
  }, 60_000);

  it("adds the supporting line and Who we help, keeps an editor's words, and reorders menus once", async () => {
    // A home page and header as they were before U2, with an editor's own hero line in one market.
    const home = await payload.findByID({
      collection: "pages",
      id: homeId,
      locale: "bw",
      fallbackLocale: false,
      depth: 0,
    });
    const old = (home.layout ?? []).filter((b) => b.blockType !== "whoWeHelp");
    const hero = old.find((b) => b.blockType === "homeHero")!;
    hero.supporting = "Our own words.";
    const services = old.find((b) => b.blockType === "numberedServices")!;
    services.items = [...(services.items ?? [])].reverse();
    await payload.update({
      collection: "pages",
      id: homeId,
      locale: "bw",
      data: { layout: old, _status: "published" },
    });
    const header = await payload.findGlobal({
      slug: "header",
      locale: "bw",
      depth: 0,
    });
    await payload.updateGlobal({
      slug: "header",
      locale: "bw",
      data: {
        // Support first, then the pillars backwards.
        menus: [...(header.menus ?? []).filter((m) => m.label === "Support"), ...(header.menus ?? []).filter((m) => m.label !== "Support").reverse()],
        _status: "published",
      },
    });

    await payload.kv.delete("website-seed:u2-positioning");
    const { seedWebsite } = await import("../src/cms/seed");
    expect(await seedWebsite(payload)).toMatch(/Who we help/);
    expect(await seedWebsite(payload)).toBeNull();

    const after = await payload.findByID({
      collection: "pages",
      id: homeId,
      locale: "bw",
      fallbackLocale: false,
      depth: 0,
    });
    expect(after.layout?.find((b) => b.blockType === "homeHero")).toMatchObject({ supporting: "Our own words." });
    expect(after.layout?.filter((b) => b.blockType === "whoWeHelp")).toHaveLength(1);
    const items = after.layout?.find((b) => b.blockType === "numberedServices")?.items ?? [];
    expect(isPillarOrdered(items, (i) => i.title)).toBe(true);
    const menus = (await payload.findGlobal({ slug: "header", locale: "bw", depth: 0 })).menus ?? [];
    expect(isPillarOrdered(menus, (m) => m.label)).toBe(true);
    // Support is not a pillar, so it keeps its place.
    expect(menus[0].label).toBe("Support");
  }, 60_000);
});
