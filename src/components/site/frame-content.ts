import { linkHref, type CmsLinkValue } from "./links";

/** The header's menus and the footer's links, with every address worked out for the market. */

export interface FrameLink {
  label: string;
  href: string;
}

export interface MenuLinkView extends FrameLink {
  description: string | null;
}

export type FeatureKind = "domainSearch" | "partnerBadge" | "websitePreview" | "thebe" | "support" | "note";

export interface FeatureView {
  kind: FeatureKind;
  heading: string | null;
  text: string | null;
  link: FrameLink | null;
}

export interface MenuView {
  id: string;
  label: string;
  /** Shown at the right, beside Get started (Support). */
  right: boolean;
  columns: { heading: string | null; links: MenuLinkView[] }[];
  feature: FeatureView | null;
}

export interface FrameContent {
  menus: MenuView[];
  /** Plain links beside the menus (Plans). */
  links: FrameLink[];
  newsletter: { heading: string; text: string | null } | null;
  tagline: string | null;
  columns: { heading: string; links: FrameLink[] }[];
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
  /** Thebe's website, for links that go there (THEBE_URL). */
  thebeUrl?: string | null;
}

/** What decides whether a link shows: its products on sale, and the help centre and Insights having articles. */
export interface FrameGates {
  onSale: (products: unknown) => boolean;
  helpOpen: boolean;
  /** False while nothing is published on the Insights page; links to it hide. Shown when left out. */
  insightsOpen?: boolean;
  /** False while no pre-sales engineer has hours set; links to the booking page hide. Shown when left out. */
  bookingOpen?: boolean;
}

type LinkRow = { link?: CmsLinkValue | null };
type MenuLinkRow = LinkRow & { description?: string | null; products?: unknown };
type HeaderData = {
  menus?:
    | {
        label?: string | null;
        right?: boolean | null;
        columns?: { heading?: string | null; links?: MenuLinkRow[] | null }[] | null;
        feature?: { kind?: string | null; heading?: string | null; text?: string | null; link?: CmsLinkValue | null } | null;
      }[]
    | null;
  links?: MenuLinkRow[] | null;
};
type FooterData = {
  newsletter?: { heading?: string | null; text?: string | null } | null;
  tagline?: string | null;
  columns?: { heading?: string | null; links?: LinkRow[] | null }[] | null;
  contact?: { email?: string | null; phone?: string | null; whatsapp?: string | null; hours?: string | null; address?: string | null } | null;
  social?: { linkedin?: string | null; facebook?: string | null } | null;
};

const clean = (v: string | null | undefined) => v?.trim() || null;

const hasProducts = (value: unknown) => {
  const v = value as { categories?: unknown[]; products?: unknown[] } | null | undefined;
  return Boolean(v && ((v.categories?.length ?? 0) > 0 || (v.products?.length ?? 0) > 0));
};

/** `details` is the footer the contact and social links come from, when the links fall back to the built-in footer. */
export function frameContent(header: HeaderData, footer: FooterData, market: FrameMarketContact, gates: FrameGates, details: FooterData = footer): FrameContent {
  const help = `/${market.code}/help`;
  const insights = `/${market.code}/insights`;
  const under = (href: string, base: string) => href === base || href.startsWith(`${base}/`) || href.startsWith(`${base}#`) || href.startsWith(`${base}?`);
  const resolve = (link: CmsLinkValue | null | undefined): FrameLink | null => {
    const href = linkHref(link, market);
    if (!href) return null;
    if (!gates.helpOpen && under(href, help)) return null;
    if (gates.insightsOpen === false && under(href, insights)) return null;
    if (gates.bookingOpen === false && under(href, `/${market.code}/book`)) return null;
    return { label: link!.label!, href };
  };
  const all = (rows: LinkRow[] | null | undefined) => (rows ?? []).flatMap((r) => resolve(r.link) ?? []);
  const menuLinks = (rows: MenuLinkRow[] | null | undefined): MenuLinkView[] =>
    (rows ?? []).flatMap((r) => {
      if (hasProducts(r.products) && !gates.onSale(r.products)) return [];
      const l = resolve(r.link);
      return l ? [{ ...l, description: clean(r.description) }] : [];
    });

  return {
    menus: (header.menus ?? []).flatMap((m, i) => {
      const columns = (m.columns ?? []).map((c) => ({ heading: clean(c.heading), links: menuLinks(c.links) })).filter((c) => c.links.length);
      if (!m.label || !columns.length) return [];
      const f = m.feature;
      const feature: FeatureView | null = f?.kind ? { kind: f.kind as FeatureKind, heading: clean(f.heading), text: clean(f.text), link: resolve(f.link) } : null;
      return [{ id: `menu-${i + 1}`, label: m.label, right: Boolean(m.right), columns, feature }];
    }),
    links: menuLinks(header.links).map(({ label, href }) => ({ label, href })),
    newsletter: clean(footer.newsletter?.heading) ? { heading: clean(footer.newsletter?.heading)!, text: clean(footer.newsletter?.text) } : null,
    tagline: clean(footer.tagline),
    columns: (footer.columns ?? []).flatMap((c) => {
      const links = all(c.links);
      return c.heading && links.length ? [{ heading: c.heading, links }] : [];
    }),
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
