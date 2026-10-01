/** A link from the website editor: its words and where it goes. */
export interface CmsLinkValue {
  label?: string | null;
  to?: "market" | "site" | "email" | "thebe" | null;
  path?: string | null;
  subject?: string | null;
}

/**
 * Where a link goes, or null when it has no words (an empty button isn't
 * shown) or goes to Thebe while Thebe's address isn't set. "A page in this market" is under the market's address:
 * /pricing → /bw/pricing, / → /bw, /#services → /bw#services.
 */
export function linkHref(link: CmsLinkValue | null | undefined, market: { code: string; supportEmail: string; thebeUrl?: string | null }): string | null {
  if (!link?.label) return null;
  // Thebe's website comes from the server's settings (THEBE_URL); the link hides until it is set.
  if (link.to === "thebe") return market.thebeUrl || null;
  if (link.to === "email") return `mailto:${market.supportEmail}${link.subject ? `?subject=${encodeURIComponent(link.subject)}` : ""}`;
  const path = link.path && link.path.startsWith("/") && !link.path.startsWith("//") ? link.path : "/";
  if (link.to === "site") return path;
  return `/${market.code}${/^\/($|[#?])/.test(path) ? path.slice(1) : path}`;
}
