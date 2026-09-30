import { linkHref, type CmsLinkValue } from "./links";

/** The header's menu and the footer's links, with every address worked out for the market. */

export interface FrameLink {
  label: string;
  href: string;
}

export interface MenuGroupView {
  id: string;
  icon: string;
  title: string;
  blurb: string;
  links: FrameLink[];
  /** "From P 100.00 per user a month", from the market's price book. */
  from?: string | null;
}

export interface FrameContent {
  groups: MenuGroupView[];
  menuNote: string | null;
  menuLink: FrameLink | null;
  pages: FrameLink[];
  tagline: string | null;
  columns: { heading: string; links: FrameLink[] }[];
  contactHeading: string;
}

type LinkRow = { link?: CmsLinkValue | null };
type HeaderData = { groups?: { icon?: string | null; title?: string | null; blurb?: string | null; links?: LinkRow[] | null }[] | null; menuNote?: string | null; menuLink?: CmsLinkValue | null; pages?: LinkRow[] | null };
type FooterData = { tagline?: string | null; columns?: { heading?: string | null; links?: LinkRow[] | null }[] | null; contactHeading?: string | null };

export function frameContent(header: HeaderData, footer: FooterData, market: { code: string; supportEmail: string }): FrameContent {
  const resolve = (link: CmsLinkValue | null | undefined): FrameLink | null => {
    const href = linkHref(link, market);
    return href ? { label: link!.label!, href } : null;
  };
  const all = (rows: LinkRow[] | null | undefined) => (rows ?? []).flatMap((r) => resolve(r.link) ?? []);
  return {
    groups: (header.groups ?? []).flatMap((g, i) => {
      const links = all(g.links);
      return g.title && links.length ? [{ id: `group-${i + 1}`, icon: g.icon ?? "boxes", title: g.title, blurb: g.blurb ?? "", links }] : [];
    }),
    menuNote: header.menuNote ?? null,
    menuLink: resolve(header.menuLink),
    pages: all(header.pages),
    tagline: footer.tagline ?? null,
    columns: (footer.columns ?? []).flatMap((c) => (c.heading ? [{ heading: c.heading, links: all(c.links) }] : [])),
    contactHeading: footer.contactHeading || "Talk to us",
  };
}
