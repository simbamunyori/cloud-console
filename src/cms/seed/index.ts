import type { Payload } from "payload";
import { DEFAULT_LOCALE, MARKET_LOCALES } from "../locales";
import { SUPPORTING_LINE } from "@/config/positioning";
import { inPillarOrder, isPillarOrdered } from "../pillars";
import { homeLayout, PROOF_STRIP, WHO_WE_HELP } from "../seed-home";
import { DEFAULT_FOOTER, DEFAULT_HEADER } from "../seed-frame";
import type { Page } from "../payload-types";
import { legalFromMarkdown } from "./legal-markdown";
import { BW_LEGAL } from "./legal/bw";
import { pricingLayout, quoteLayout, securityLayout } from "./pages";

/**
 * The website editor's first content: the home, pricing, security and
 * quote pages in every market, Botswana's legal text, and the header and footer,
 * all as the site showed them before the editor. Each part is added once
 * (remembered in the editor's key-value store) and only if it isn't there,
 * so an editor's work is never overwritten and a part they delete stays
 * deleted. Returns what it did, in words, or null when it did nothing.
 */
export async function seedWebsite(payload: Payload): Promise<string | null> {
  const done: string[] = [];
  const once = async (key: string, what: string, add: () => Promise<boolean>) => {
    const marker = `website-seed:${key}`;
    if (await payload.kv.has(marker)) return;
    if (await add()) done.push(what);
    await payload.kv.set(marker, new Date().toISOString());
  };

  const page = (slug: string, title: string, layout: (market: string) => NonNullable<Page["layout"]>) => async () => {
    const { totalDocs } = await payload.count({ collection: "pages", where: { slug: { equals: slug } }, overrideAccess: true });
    if (totalDocs) return false;
    const [first, ...rest] = MARKET_LOCALES;
    const doc = await payload.create({ collection: "pages", locale: first.code, data: { title, slug, layout: layout(first.code), _status: "published" }, overrideAccess: true });
    for (const l of rest) await payload.update({ collection: "pages", id: doc.id, locale: l.code, data: { layout: layout(l.code), _status: "published" }, overrideAccess: true });
    return true;
  };

  await once("home", "the home page", page("home", "Home", homeLayout));
  // Milestone 3 (docs/FINAL_BUILD.md): the home page, header and footer as designed replace the first versions, once.
  // Earlier versions stay in each document's version history.
  await once("home-designed", "the home page as designed", async () => {
    const { docs } = await payload.find({ collection: "pages", where: { slug: { equals: "home" } }, limit: 1, overrideAccess: true, draft: true });
    if (!docs[0]) return page("home", "Home", homeLayout)();
    for (const l of MARKET_LOCALES) await payload.update({ collection: "pages", id: docs[0].id, locale: l.code, data: { layout: homeLayout(l.code), _status: "published" }, overrideAccess: true });
    return true;
  });
  // Milestone 4: the proof section under the domain search, added once to each market's home page without touching the rest.
  await once("home-proof", "the proof section on the home page", async () => {
    const { docs } = await payload.find({ collection: "pages", where: { slug: { equals: "home" } }, limit: 1, overrideAccess: true, depth: 0 });
    if (!docs[0]) return false;
    let added = false;
    for (const l of MARKET_LOCALES) {
      const home = await payload.findByID({ collection: "pages", id: docs[0].id, locale: l.code, fallbackLocale: false, depth: 0, overrideAccess: true });
      const layout = home.layout ?? [];
      if (!layout.length || layout.some((b) => b.blockType === "proofStrip")) continue;
      const at = layout.findIndex((b) => b.blockType === "domainStore");
      const { id: _id, ...strip } = PROOF_STRIP() as { id?: string };
      const next = [...layout.slice(0, at + 1), strip, ...layout.slice(at + 1)] as typeof layout;
      await payload.update({ collection: "pages", id: docs[0].id, locale: l.code, data: { layout: next, _status: "published" }, overrideAccess: true });
      added = true;
    }
    return added;
  });
  await once("proof-numbers", "the first proof numbers", async () => {
    const { totalDocs } = await payload.count({ collection: "proof-numbers", overrideAccess: true });
    if (totalDocs) return false;
    await payload.create({ collection: "proof-numbers", data: { calculated: "typed", value: "2014", label: "Looking after businesses since", source: "The company's founding year.", visible: true }, overrideAccess: true });
    await payload.create({ collection: "proof-numbers", data: { calculated: "medianFirstReply", label: "Median first reply", source: "Worked out from the last 90 days of support tickets; hidden while there are fewer than 30.", visible: true }, overrideAccess: true });
    return true;
  });
  await once("pricing", "the pricing page", page("pricing", "Pricing", pricingLayout));
  await once("security", "the security page", page("security", "Security", securityLayout));
  await once("quote", "the quote page", page("quote", "Ask for a quote", quoteLayout));

  await once("legal-bw", "Botswana's legal text", async () => {
    let added = false;
    for (const [kind, markdown] of Object.entries(BW_LEGAL)) {
      const { totalDocs } = await payload.count({ collection: "legal", where: { kind: { equals: kind } }, overrideAccess: true });
      if (totalDocs) continue;
      const { title, draftNotice, updated, body } = legalFromMarkdown(markdown);
      await payload.create({
        collection: "legal",
        locale: DEFAULT_LOCALE,
        data: { kind: kind as keyof typeof BW_LEGAL, title, updated, draftNotice, body: body as never, approvedByLegal: false, _status: "published" },
        overrideAccess: true,
      });
      added = true;
    }
    return added;
  });

  // Milestone 6 added Thapelo to the privacy notice and the providers list.
  // Only drafts nobody has edited since they were seeded are refreshed.
  await once("legal-bw-thapelo", "Thapelo in the privacy notice", async () => {
    let changed = false;
    for (const kind of ["privacy", "service-providers"] as const) {
      const { docs } = await payload.find({ collection: "legal", where: { kind: { equals: kind } }, locale: DEFAULT_LOCALE, limit: 1, depth: 0, overrideAccess: true });
      const doc = docs[0];
      if (!doc || doc.approvedByLegal || Math.abs(Date.parse(doc.updatedAt) - Date.parse(doc.createdAt)) > 60_000) continue;
      const { updated, body } = legalFromMarkdown(BW_LEGAL[kind]);
      await payload.update({ collection: "legal", id: doc.id, locale: DEFAULT_LOCALE, data: { updated, body: body as never, _status: "published" }, overrideAccess: true });
      changed = true;
    }
    return changed;
  });

  await once("header", "the header", async () => {
    await payload.updateGlobal({ slug: "header", data: { ...DEFAULT_HEADER, _status: "published" }, overrideAccess: true });
    return true;
  });
  await once("footer", "the footer", async () => {
    await payload.updateGlobal({ slug: "footer", data: { ...DEFAULT_FOOTER, _status: "published" }, overrideAccess: true });
    return true;
  });
  await once("header-designed", "the header as designed", async () => {
    for (const l of MARKET_LOCALES) await payload.updateGlobal({ slug: "header", locale: l.code, data: { ...DEFAULT_HEADER, _status: "published" }, overrideAccess: true });
    return true;
  });
  await once("footer-designed", "the footer as designed", async () => {
    for (const l of MARKET_LOCALES) await payload.updateGlobal({ slug: "footer", locale: l.code, data: { ...DEFAULT_FOOTER, _status: "published" }, overrideAccess: true });
    return true;
  });

  // Milestone 7: Insights in the Support menu and the footer's Company column, added to what is there.
  await once("frame-insights", "Insights links in the header and footer", async () => {
    const isInsights = (row: { link?: { to?: string | null; path?: string | null } | null }) => row.link?.to === "market" && row.link.path === "/insights";
    const [menuItem] = DEFAULT_HEADER.menus.find((m) => m.label === "Support")!.columns[0].links.filter(isInsights);
    const [footerItem] = DEFAULT_FOOTER.columns.find((c) => c.heading === "Company")!.links.filter(isInsights);
    let changed = false;
    for (const l of MARKET_LOCALES) {
      const header = await payload.findGlobal({ slug: "header", locale: l.code, depth: 0, overrideAccess: true });
      const support = header.menus?.find((m) => m.label === "Support");
      const column = support?.columns?.[0];
      if (column && !header.menus!.some((m) => m.columns?.some((c) => c.links?.some(isInsights)))) {
        column.links = [...(column.links ?? []), menuItem];
        await payload.updateGlobal({ slug: "header", locale: l.code, data: { menus: header.menus, _status: "published" }, overrideAccess: true });
        changed = true;
      }
      const footer = await payload.findGlobal({ slug: "footer", locale: l.code, depth: 0, overrideAccess: true });
      const company = footer.columns?.find((c) => c.heading === "Company");
      if (company && !footer.columns!.some((c) => c.links?.some(isInsights))) {
        const links = company.links ?? [];
        company.links = [...links.slice(0, 1), footerItem, ...links.slice(1)];
        await payload.updateGlobal({ slug: "footer", locale: l.code, data: { columns: footer.columns, _status: "published" }, overrideAccess: true });
        changed = true;
      }
    }
    return changed;
  });

  // Milestone 8: the free tools in the Security and Email menus and the footer, added to what is there.
  await once("frame-tools", "the free tools in the header and footer", async () => {
    const isTool = (row: { link?: { to?: string | null; path?: string | null } | null }) => row.link?.to === "market" && Boolean(row.link.path?.startsWith("/tools"));
    const security = DEFAULT_HEADER.menus.find((m) => m.label === "Security")!;
    const checks = security.columns.find((c) => c.heading === "Free checks")!;
    const calculator = DEFAULT_HEADER.menus.find((m) => m.label === "Email")!.columns[1].links.find(isTool)!;
    const [footerItem] = DEFAULT_FOOTER.columns.find((c) => c.heading === "Company")!.links.filter(isTool);
    let changed = false;
    for (const l of MARKET_LOCALES) {
      const header = await payload.findGlobal({ slug: "header", locale: l.code, depth: 0, overrideAccess: true });
      if (header.menus?.length && !header.menus.some((m) => m.columns?.some((c) => c.links?.some(isTool)))) {
        const sec = header.menus.find((m) => m.label === "Security");
        if (sec?.columns) {
          sec.columns = [...sec.columns, checks].slice(0, 3);
          // The designed feature for this menu is the free check; an edited note stays.
          if (sec.feature?.kind === "note" && sec.feature.heading === "Protected, without the jargon") sec.feature = security.feature;
        }
        const email = header.menus.find((m) => m.label === "Email");
        const column = email?.columns?.[1] ?? email?.columns?.[0];
        if (column) column.links = [...(column.links ?? []), calculator];
        await payload.updateGlobal({ slug: "header", locale: l.code, data: { menus: header.menus, _status: "published" }, overrideAccess: true });
        changed = true;
      }
      const footer = await payload.findGlobal({ slug: "footer", locale: l.code, depth: 0, overrideAccess: true });
      const company = footer.columns?.find((c) => c.heading === "Company");
      if (company && !footer.columns!.some((c) => c.links?.some(isTool))) {
        const links = company.links ?? [];
        const at = Math.max(0, links.length - 1);
        company.links = [...links.slice(0, at), footerItem, ...links.slice(at)];
        await payload.updateGlobal({ slug: "footer", locale: l.code, data: { columns: footer.columns, _status: "published" }, overrideAccess: true });
        changed = true;
      }
    }
    return changed;
  });

  // Milestone 9: the new products and on-site compliance projects in the menus, added to what is there.
  // Each link hides itself until its product is live and priced; the projects link goes to the quote form.
  await once("frame-catalogue-additions", "the new products in the header", async () => {
    const additions: { menu: string; heading: string; key: string; at: "start" | "end" }[] = [
      { menu: "Email", heading: "Email and documents", key: "fourth-generation-signatures", at: "end" },
      { menu: "Websites", heading: "Your website", key: "website-builder", at: "start" },
      { menu: "Security", heading: "Protection", key: "compliance-archiving", at: "end" },
      { menu: "Security", heading: "Protection", key: "/quote?for=compliance-project", at: "end" },
    ];
    type Row = { link?: { path?: string | null } | null; products?: { products?: (string | { slug?: string })[] | null } | null };
    const keyOf = (row: Row) => [...(row.products?.products ?? []).map((p) => (typeof p === "string" ? p : p.slug)), row.link?.path];
    let changed = false;
    for (const l of MARKET_LOCALES) {
      const header = await payload.findGlobal({ slug: "header", locale: l.code, depth: 0, overrideAccess: true });
      if (!header.menus?.length) continue;
      let touched = false;
      for (const a of additions) {
        const designed = DEFAULT_HEADER.menus.find((m) => m.label === a.menu)!.columns.find((c) => c.heading === a.heading)!.links.find((row) => keyOf(row as Row).includes(a.key))!;
        const menu = header.menus.find((m) => m.label === a.menu);
        const column = menu?.columns?.find((c) => c.heading === a.heading) ?? menu?.columns?.[0];
        if (!column || menu!.columns!.some((c) => c.links?.some((row) => keyOf(row as Row).includes(a.key)))) continue;
        const links = column.links ?? [];
        if (links.length >= 8) continue;
        column.links = a.at === "start" ? [designed, ...links] : [...links, designed];
        touched = true;
      }
      if (touched) {
        await payload.updateGlobal({ slug: "header", locale: l.code, data: { menus: header.menus, _status: "published" }, overrideAccess: true });
        changed = true;
      }
    }
    return changed;
  });

  // STRATEGY_ROLLOUT U2: the supporting line under the hero and in the search description, Who we help (hidden
  // until a Publisher approves it), and the pillar order in What we look after, the footer column of the same
  // name and the header's menus. Added to what is there: an editor's own words and entries are kept.
  await once("u2-positioning", "the supporting line, Who we help and the pillar order", async () => {
    let changed = false;
    const { docs } = await payload.find({ collection: "pages", where: { slug: { equals: "home" } }, limit: 1, overrideAccess: true, depth: 0 });
    for (const l of docs[0] ? MARKET_LOCALES : []) {
      const home = await payload.findByID({ collection: "pages", id: docs[0].id, locale: l.code, fallbackLocale: false, depth: 0, overrideAccess: true });
      let layout = home.layout ?? [];
      if (!layout.length) continue;
      let touched = false;
      const hero = layout.find((b) => b.blockType === "homeHero");
      if (hero && !hero.supporting) {
        hero.supporting = SUPPORTING_LINE;
        touched = true;
      }
      if (!layout.some((b) => b.blockType === "whoWeHelp")) {
        const services = layout.findIndex((b) => b.blockType === "numberedServices");
        const at = services >= 0 ? services + 1 : Math.max(1, layout.findIndex((b) => b.blockType === "proofStrip") + 1);
        layout = [...layout.slice(0, at), WHO_WE_HELP(), ...layout.slice(at)] as typeof layout;
        touched = true;
      }
      for (const b of layout) {
        if (b.blockType !== "numberedServices" || !b.items || isPillarOrdered(b.items, (i) => i.title)) continue;
        b.items = inPillarOrder(b.items, (i) => i.title);
        touched = true;
      }
      // An editor's own search description gets the supporting line in front, when it still fits.
      const seo = home.seo ?? {};
      const description = seo.description && !seo.description.includes(SUPPORTING_LINE) ? `${SUPPORTING_LINE} ${seo.description}` : null;
      const seoChange = description && description.length <= 170 ? { seo: { ...seo, image: typeof seo.image === "object" ? seo.image?.id : seo.image, description } } : {};
      if (!touched && !("seo" in seoChange)) continue;
      await payload.update({ collection: "pages", id: docs[0].id, locale: l.code, data: { layout, ...seoChange, _status: "published" }, overrideAccess: true });
      changed = true;
    }
    for (const l of MARKET_LOCALES) {
      const header = await payload.findGlobal({ slug: "header", locale: l.code, depth: 0, overrideAccess: true });
      if (header.menus?.length && !isPillarOrdered(header.menus, (m) => m.label)) {
        await payload.updateGlobal({ slug: "header", locale: l.code, data: { menus: inPillarOrder(header.menus, (m) => m.label), _status: "published" }, overrideAccess: true });
        changed = true;
      }
      const footer = await payload.findGlobal({ slug: "footer", locale: l.code, depth: 0, overrideAccess: true });
      const column = footer.columns?.find((c) => c.heading === "What we look after");
      if (column?.links && !isPillarOrdered(column.links, (r) => r.link?.label)) {
        column.links = inPillarOrder(column.links, (r) => r.link?.label);
        await payload.updateGlobal({ slug: "footer", locale: l.code, data: { columns: footer.columns, _status: "published" }, overrideAccess: true });
        changed = true;
      }
    }
    return changed;
  });

  return done.length ? `Added to the website editor: ${done.join(", ")}.` : null;
}
