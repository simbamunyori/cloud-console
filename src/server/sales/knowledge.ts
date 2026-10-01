import "server-only";
import type { Market } from "@prisma/client";
import { DEFAULT_LOCALE } from "@/cms/locales";
import { formatMoney } from "@/lib/domain/money";
import { richTextPlain } from "@/lib/rich-text-plain";
import { cms, marketLocale } from "@/server/site/cms";
import { storeSearch } from "@/server/site/domain-store";
import { productPage, productPageSlugs, productPath, sitePrices, taxNote } from "@/server/site/site";
import type { KnowledgeSource, SalesSettings } from "./assistant";
import { rank } from "./rank";

/**
 * What Thapelo may know, for one market, read from the same places the
 * public site shows: the catalogue with the price book's prices, the help
 * centre, FAQ sections on published pages, published insights, and the
 * extra knowledge staff write in the editor. Published content only.
 */

export const DEFAULT_GREETING = "Hi, I'm Thapelo. I can help you find a domain, choose a plan or move your email. What does your business do?";
export const DEFAULT_QUICK_REPLIES = ["Find a domain", "Compare plans", "Move my email"];

/** Thapelo's settings for a market, or null where it is switched off. */
export async function salesSettings(code: string): Promise<SalesSettings | null> {
  const payload = await cms();
  const g = await payload.findGlobal({ slug: "sales-assistant", locale: marketLocale(code), fallbackLocale: DEFAULT_LOCALE, depth: 0, overrideAccess: true });
  if (((g.off ?? []) as string[]).includes(code)) return null;
  const replies = (g.quickReplies ?? []).map((r) => r.label?.trim()).filter((l): l is string => Boolean(l));
  return { greeting: g.greeting?.trim() || DEFAULT_GREETING, quickReplies: replies.length ? replies : DEFAULT_QUICK_REPLIES, knowledge: g.knowledge?.trim() ?? "" };
}

const published = { _status: { equals: "published" } } as const;

interface Doc {
  kind: "help" | "faq" | "insight";
  title: string;
  url: string;
  text: string;
}

async function documents(code: string): Promise<Doc[]> {
  const payload = await cms();
  const base = { locale: marketLocale(code), fallbackLocale: DEFAULT_LOCALE, depth: 0, overrideAccess: true } as const;
  const [help, insights, pages, productPages] = await Promise.all([
    payload.find({ collection: "help", where: published, limit: 300, ...base }),
    payload.find({ collection: "insights", where: published, sort: "-publishedAt", limit: 100, ...base }),
    payload.find({ collection: "pages", where: published, limit: 300, ...base }),
    productPageSlugs(code).then((slugs) => Promise.all(slugs.map((slug) => productPage(code, slug)))),
  ]);
  const docs: Doc[] = [];
  for (const h of help.docs) if (h.title && h.body) docs.push({ kind: "help", title: h.title, url: `/${code}/help/${h.slug}`, text: `${h.summary ?? ""}\n${richTextPlain(h.body)}` });
  for (const i of insights.docs) if (i.title && i.body) docs.push({ kind: "insight", title: i.title, url: `/${code}/insights/${i.slug}`, text: `${i.summary ?? ""}\n${richTextPlain(i.body)}` });
  for (const p of pages.docs) {
    for (const block of (p.layout ?? []) as { blockType?: string; items?: { question?: string | null; answer?: unknown }[] | null }[]) {
      if (block.blockType !== "faq") continue;
      for (const item of block.items ?? []) {
        if (item.question) docs.push({ kind: "faq", title: item.question, url: `/${code}${p.slug === "home" ? "" : `/${p.slug}`}`, text: richTextPlain(item.answer) });
      }
    }
  }
  // Product pages a Publisher approved: who each is for, and its questions.
  for (const page of productPages) {
    if (!page) continue;
    const url = productPath(code, page.product.slug);
    if (page.audience) docs.push({ kind: "faq", title: `Who ${page.product.name} is for`, url, text: page.audience });
    for (const f of page.faq) docs.push({ kind: "faq", title: f.question, url, text: f.answer });
  }
  return docs;
}

/** The knowledge Thapelo's tools read, for one market. */
export function siteKnowledge(m: Market): KnowledgeSource {
  let docs: Promise<Doc[]> | null = null;
  return {
    async products() {
      const prices = await sitePrices(m.code);
      return {
        taxNote: taxNote(m),
        products: prices.map((p) => ({ slug: p.slug, name: p.name, summary: p.summary, category: p.categoryKey, price: formatMoney(p.price, m.locale), per: p.unitLabel })),
      };
    },
    async search(query) {
      docs ??= documents(m.code);
      return rank(await docs, query).map((d) => ({ kind: d.kind, title: d.title, url: d.url, text: d.text.slice(0, 1500) }));
    },
    domains: (query) => storeSearch(m, query),
  };
}
