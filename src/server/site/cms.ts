import "server-only";
import config from "@payload-config";
import { cookies, draftMode, headers } from "next/headers";
import { getPayload, type Where } from "payload";
import { cache } from "react";
import { DEFAULT_LOCALE, isMarketLocale } from "@/cms/locales";
import type { LegalKindValue } from "@/cms/collections/legal";
import type { Insight, Legal, Page } from "@/cms/payload-types";
import { DEFAULT_FOOTER, DEFAULT_HEADER } from "@/cms/seed-frame";
import { frameContent, type FrameContent, type FrameMarketContact } from "@/components/site/frame-content";
import { authDeps } from "@/server/auth/next";
import { websiteStaffFromCookies } from "@/server/cms/staff-session";

export const cms = () => getPayload({ config });

/** The market's content locale: its own, or Botswana's for a market the editor doesn't know yet. */
export const marketLocale = (code: string) => (isMarketLocale(code) ? code : DEFAULT_LOCALE);

/**
 * Whether this request shows drafts: draft mode is on (from /preview) and
 * it comes from staff who may use the website editor. Checked on every
 * request, so a leftover draft-mode cookie shows nothing unpublished.
 */
export const showingDrafts = cache(async (): Promise<boolean> => {
  if (!(await draftMode()).isEnabled) return false;
  const cookieHeader = (await headers()).get("cookie") ?? (await cookies()).toString();
  return Boolean(await websiteStaffFromCookies(authDeps(), cookieHeader));
});

/** A page for a market: the published version, or the latest draft in preview. Null when there is none. */
export const cmsPage = cache(async (market: string, slug: string): Promise<Page | null> => {
  const draft = await showingDrafts();
  const payload = await cms();
  const { docs } = await payload.find({
    collection: "pages",
    where: draft ? { slug: { equals: slug } } : { and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }] },
    locale: marketLocale(market),
    fallbackLocale: DEFAULT_LOCALE,
    draft,
    depth: 1,
    limit: 1,
    overrideAccess: true,
  });
  return docs[0] ?? null;
});

/** A market's legal page from the editor, or null when the market has no text of its own (never another market's). */
export const legalPage = cache(async (market: string, kind: LegalKindValue): Promise<Legal | null> => {
  if (!isMarketLocale(market)) return null;
  const draft = await showingDrafts();
  const payload = await cms();
  const { docs } = await payload.find({
    collection: "legal",
    where: draft ? { kind: { equals: kind } } : { and: [{ kind: { equals: kind } }, { _status: { equals: "published" } }] },
    locale: market,
    fallbackLocale: false,
    draft,
    depth: 1,
    limit: 1,
    overrideAccess: true,
  });
  const doc = docs[0];
  return doc?.title && doc.body ? doc : null;
});

/** The header and footer for a market: from the editor, or as they were before it while it has none. */
export const siteFrameContent = cache(async (market: FrameMarketContact): Promise<FrameContent> => {
  const draft = await showingDrafts();
  const payload = await cms();
  const read = <S extends "header" | "footer">(slug: S) => payload.findGlobal({ slug, locale: marketLocale(market.code), fallbackLocale: DEFAULT_LOCALE, draft, depth: 0, overrideAccess: true });
  const [header, footer] = await Promise.all([read("header"), read("footer")]);
  return frameContent(header?.groups?.length ? header : DEFAULT_HEADER, footer?.columns?.length ? footer : DEFAULT_FOOTER, market, footer ?? {});
});

/** The newest published insights for a market (drafts too in preview), optionally on one topic. */
export const latestInsights = cache(async (market: string, topic: string | null | undefined, limit = 3): Promise<Insight[]> => {
  const draft = await showingDrafts();
  const payload = await cms();
  const filters: Where[] = [...(topic ? [{ topic: { equals: topic } }] : []), ...(draft ? [] : [{ _status: { equals: "published" } }])];
  const { docs } = await payload.find({
    collection: "insights",
    where: filters.length ? { and: filters } : {},
    sort: "-publishedAt",
    locale: marketLocale(market),
    fallbackLocale: DEFAULT_LOCALE,
    draft,
    depth: 1,
    limit,
    overrideAccess: true,
  });
  return docs.filter((d) => d.title && d.summary);
});

/** One insight for a market by its address, or null. */
export const insightBySlug = cache(async (market: string, slug: string): Promise<Insight | null> => {
  const draft = await showingDrafts();
  const payload = await cms();
  const { docs } = await payload.find({
    collection: "insights",
    where: draft ? { slug: { equals: slug } } : { and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }] },
    locale: marketLocale(market),
    fallbackLocale: DEFAULT_LOCALE,
    draft,
    depth: 1,
    limit: 1,
    overrideAccess: true,
  });
  const doc = docs[0];
  return doc?.title && doc.body ? doc : null;
});
