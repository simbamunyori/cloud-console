/** A link from the website editor: its words and where it goes. */
export interface CmsLinkValue {
  label?: string | null;
  to?: "market" | "site" | "email" | null;
  path?: string | null;
  subject?: string | null;
}

/**
 * Where a link goes, or null when it has no words (an empty button isn't
 * shown). "A page in this market" is under the market's address:
 * /pricing → /bw/pricing, / → /bw, /#services → /bw#services.
 */
export function linkHref(link: CmsLinkValue | null | undefined, market: { code: string; supportEmail: string }): string | null {
  if (!link?.label) return null;
  if (link.to === "email") return `mailto:${market.supportEmail}${link.subject ? `?subject=${encodeURIComponent(link.subject)}` : ""}`;
  const path = link.path && link.path.startsWith("/") && !link.path.startsWith("//") ? link.path : "/";
  if (link.to === "site") return path;
  return `/${market.code}${/^\/($|[#?])/.test(path) ? path.slice(1) : path}`;
}
