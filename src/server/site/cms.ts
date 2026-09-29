import "server-only";
import config from "@payload-config";
import { cookies, draftMode, headers } from "next/headers";
import { getPayload } from "payload";
import { cache } from "react";
import { DEFAULT_LOCALE, isMarketLocale } from "@/cms/locales";
import type { Page } from "@/cms/payload-types";
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
