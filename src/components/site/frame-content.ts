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
  /** The market's contact details, with the editor's where it set them. */
  contact: { email: string; phone: string | null; hours: string; address: string | null };
  /** LinkedIn, Facebook and WhatsApp, each only when set. */
  social: FrameLink[];
}

export interface FrameMarketContact {
  code: string;
  supportEmail: string;
  supportPhone?: string | null;
  supportHours?: string;
}

type LinkRow = { link?: CmsLinkValue | null };
type HeaderData = { groups?: { icon?: string | null; title?: string | null; blurb?: string | null; links?: LinkRow[] | null }[] | null; menuNote?: string | null; menuLink?: CmsLinkValue | null; pages?: LinkRow[] | null };
type FooterData = {
  tagline?: string | null;
  columns?: { heading?: string | null; links?: LinkRow[] | null }[] | null;
  contactHeading?: string | null;
  contact?: { email?: string | null; phone?: string | null; whatsapp?: string | null; hours?: string | null; address?: string | null } | null;
  social?: { linkedin?: string | null; facebook?: string | null } | null;
};

const clean = (v: string | null | undefined) => v?.trim() || null;

/** `details` is the footer the contact and social links come from, when the links fall back to the built-in footer. */
export function frameContent(header: HeaderData, footer: FooterData, market: FrameMarketContact, details: FooterData = footer): FrameContent {
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
    contact: {
      email: clean(details.contact?.email) ?? market.supportEmail,
      phone: clean(details.contact?.phone) ?? market.supportPhone ?? null,
      hours: clean(details.contact?.hours) ?? market.supportHours ?? "",
      address: clean(details.contact?.address),
    },
    social: [
      ...(clean(details.social?.linkedin) ? [{ label: "LinkedIn", href: clean(details.social?.linkedin)! }] : []),
      ...(clean(details.social?.facebook) ? [{ label: "Facebook", href: clean(details.social?.facebook)! }] : []),
      ...(clean(details.contact?.whatsapp) ? [{ label: "WhatsApp", href: `https://wa.me/${clean(details.contact?.whatsapp)!.replace(/\D/g, "")}` }] : []),
    ],
  };
}
