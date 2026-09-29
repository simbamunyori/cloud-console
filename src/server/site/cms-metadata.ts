import "server-only";
import type { Metadata } from "next";
import type { Page } from "@/cms/payload-types";
import { showingDrafts } from "./cms";
import { siteMetadata } from "./site";

/** A page's search and sharing details from the editor, over the site's defaults. Drafts are never indexed. */
export async function cmsMetadata(code: string, path: string, page: Pick<Page, "seo">, fallback: { title: string; description: string }): Promise<Metadata> {
  const seo = page.seo ?? {};
  const meta = await siteMetadata(code, path, { title: seo.title || fallback.title, description: seo.description || fallback.description });
  const image = seo.image && typeof seo.image === "object" ? (seo.image.sizes?.share?.url ?? seo.image.url) : null;
  if (image) meta.openGraph = { ...meta.openGraph, images: [{ url: image, width: 1200, height: 630, alt: seo.image && typeof seo.image === "object" ? seo.image.alt : undefined }] };
  if (await showingDrafts()) meta.robots = { index: false, follow: false };
  return meta;
}
