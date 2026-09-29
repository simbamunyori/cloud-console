import type { Payload } from "payload";
import { DEFAULT_LOCALE, MARKET_LOCALES } from "../locales";
import { homeLayout } from "../seed-home";
import { DEFAULT_FOOTER, DEFAULT_HEADER } from "../seed-frame";
import type { Page } from "../payload-types";
import { legalFromMarkdown } from "./legal-markdown";
import { BW_LEGAL } from "./legal/bw";
import { pricingLayout, securityLayout } from "./pages";

/**
 * The website editor's first content: the home, pricing and security
 * pages in every market, Botswana's legal text, and the header and footer,
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
  await once("pricing", "the pricing page", page("pricing", "Pricing", pricingLayout));
  await once("security", "the security page", page("security", "Security", securityLayout));

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

  await once("header", "the header", async () => {
    await payload.updateGlobal({ slug: "header", data: { ...DEFAULT_HEADER, _status: "published" }, overrideAccess: true });
    return true;
  });
  await once("footer", "the footer", async () => {
    await payload.updateGlobal({ slug: "footer", data: { ...DEFAULT_FOOTER, _status: "published" }, overrideAccess: true });
    return true;
  });

  return done.length ? `Added to the website editor: ${done.join(", ")}.` : null;
}
