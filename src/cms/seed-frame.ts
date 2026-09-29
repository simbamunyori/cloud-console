import { company } from "@/config/app";
import { FOOTER_LEGAL, LEGAL_PAGES, SERVICE_MENU } from "@/config/site";
import type { Footer, Header } from "./payload-types";
import type { IconName } from "./icons";

/**
 * The header and footer as they were before the website editor: its first
 * content, and what the site shows while the editor has none.
 */

const GROUP_ICONS: Record<string, IconName> = { productivity: "mail", servers: "server", security: "shield-check", web: "earth", apps: "boxes" };

type Link = { label: string; to: "market" | "site" | "email"; path?: string };
const market = (label: string, path: string): { link: Link } => ({ link: { label, to: "market", path } });
const site = (label: string, path: string): { link: Link } => ({ link: { label, to: "site", path } });

export const DEFAULT_HEADER = {
  groups: SERVICE_MENU.map((g) => ({
    icon: GROUP_ICONS[g.key] ?? "boxes",
    title: g.title,
    blurb: g.blurb,
    links: g.links.map((l) => market(l.label, l.href)),
  })),
  menuNote: "Every price is per month, in your currency, on one invoice.",
  menuLink: { label: "See every price", to: "market", path: "/pricing" },
  pages: [market("Pricing", "/pricing"), market("Security", "/security")],
} satisfies Omit<Header, "id" | "updatedAt" | "createdAt" | "_status">;

export const DEFAULT_FOOTER = {
  tagline: company.tagline,
  columns: [
    { heading: "Services", links: [market("What we manage", "/#services"), market("Pricing", "/pricing"), site("Get started", "/sign-up"), site("Sign in", "/sign-in")] },
    { heading: "Company", links: [market("Security and data protection", "/security"), ...FOOTER_LEGAL.map((k) => market(LEGAL_PAGES[k], `/legal/${k}`))] },
  ],
  contactHeading: "Talk to us",
} satisfies Omit<Footer, "id" | "updatedAt" | "createdAt" | "_status">;
