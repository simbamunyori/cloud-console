import { OUTCOMES, PROMISE } from "./positioning";

/**
 * The public website's words, from Change Request 01, section 4. Market
 * facts (contacts, payment methods, the data protection law, legal page
 * links) live in each market's settings; the few words that differ by
 * market live in MARKET_COPY below. Nothing here names a currency: prices
 * come from the market's price book and are formatted for its locale.
 */

export const HERO = {
  kicker: "Managed cloud for business",
  headline: PROMISE,
  sub: "Microsoft 365, Google Workspace, servers, hosting and security, managed for you and billed on one monthly invoice in your currency.",
  supporting: ["One team for everything.", "Support that answers.", "Two-step login on every account."],
};

export const PLATE = {
  heading: "Less to manage. Less to worry about.",
  cards: OUTCOMES,
};

export interface ServiceCard {
  key: string;
  title: string;
  body: string;
  /** Products whose lowest price in the market shows as "From". */
  products: { categories?: string[]; slugs?: string[] };
}

export const SERVICES: ServiceCard[] = [
  {
    key: "productivity",
    title: "Microsoft 365 and Google Workspace",
    body: "Email, documents and meetings for every user, set up, secured and looked after.",
    products: { categories: ["productivity"] },
  },
  {
    key: "servers",
    title: "Cloud servers",
    body: "Managed servers, monitored and backed up.",
    products: { categories: ["servers", "public-cloud"] },
  },
  {
    key: "security",
    title: "Managed security",
    body: "Threats watched and handled around the clock, with a person who explains what happened.",
    products: { slugs: ["managed-detection-response"] },
  },
  {
    key: "protection",
    title: "Data protection support",
    body: "Backups that are tested, recovery that is planned, and a copy kept in the country where the law asks for one.",
    products: { slugs: ["backup-microsoft-365", "backup-google-workspace", "server-backup", "disaster-recovery", "local-data-copy"] },
  },
  {
    key: "web",
    title: "Hosting, email and domains",
    body: "Websites, business email, certificates and domain names, renewed on time.",
    products: { categories: ["web"] },
  },
  {
    key: "apps",
    title: "Hosted applications",
    body: "Our own software, running on our own platform and supported by the people who wrote it.",
    products: { categories: ["our-software"] },
  },
];

/**
 * The header's Services menu. Links go to the market's pricing page,
 * which lists every product under its category (`#cat-<key>`), so each
 * price shown is the market's own.
 */
export interface MenuGroup {
  key: "productivity" | "servers" | "security" | "web" | "apps";
  title: string;
  blurb: string;
  links: { label: string; href: string }[];
}

export const SERVICE_MENU: MenuGroup[] = [
  {
    key: "productivity",
    title: "Productivity",
    blurb: "Email, documents and meetings for every user.",
    links: [
      { label: "Microsoft 365", href: "/pricing#cat-productivity" },
      { label: "Google Workspace", href: "/pricing#cat-productivity" },
      { label: "Mailbox backup", href: "/pricing#cat-protection" },
    ],
  },
  {
    key: "servers",
    title: "Servers",
    blurb: "Managed servers, monitored and backed up.",
    links: [
      { label: "Managed servers", href: "/pricing#cat-servers" },
      { label: "Microsoft Azure", href: "/pricing#cat-public-cloud" },
      { label: "Server backup", href: "/pricing#cat-protection" },
    ],
  },
  {
    key: "security",
    title: "Security",
    blurb: "Threats watched and handled, data kept safe.",
    links: [
      { label: "Managed detection and response", href: "/pricing#cat-protection" },
      { label: "Disaster recovery", href: "/pricing#cat-protection" },
      { label: "How we keep you safe", href: "/security" },
    ],
  },
  {
    key: "web",
    title: "Web and domains",
    blurb: "Websites, business email and domain names.",
    links: [
      { label: "Web and WordPress hosting", href: "/pricing#cat-web" },
      { label: "Business email", href: "/pricing#cat-web" },
      { label: "Domain names", href: "/pricing#domains-title" },
    ],
  },
  {
    key: "apps",
    title: "Applications",
    blurb: "Software we build, host and support.",
    links: [
      { label: "Thebe", href: "/pricing#cat-our-software" },
      { label: "Managed support plan", href: "/pricing#cat-services" },
    ],
  },
];

export const CONSOLE = {
  heading: "One account. One invoice. One place to get help.",
  points: [
    ["Order and change services yourself", "See the new monthly total before you confirm."],
    ["Every user and licence in one view", "Unused licences are flagged, so you stop paying for them."],
    ["One invoice a month", "Every line explained, with what changed since last month."],
    ["AI answers in seconds", "With a person behind it when you need one."],
  ] as [string, string][],
};

export const BUILDERS = {
  heading: "Built by people who build software.",
  body: "We don't just host software. We build it. Our own applications run on our own platform, starting with Thebe.",
  thebe: {
    name: "Thebe",
    body: "Company ledgers where every payment is countersigned. Each payment waits for your signatories to approve it, in one tap from their email, before it leaves the bank.",
  },
};

export const AUDIENCES = {
  heading: "Who we serve",
  items: [
    ["Schools, colleges and universities", "Accounts for staff and students, and data kept safe."],
    ["Professional firms", "Confidential work, secured and backed up."],
    ["Growing businesses", "Add people and services without adding suppliers."],
    ["Software partners", "Run your applications on a platform we manage."],
  ] as [string, string][],
};

export const CLOSING = {
  heading: "Tell us what you run today and we'll show you what it looks like done properly.",
};

/**
 * Added to server copy only in markets whose settings say our own data
 * centre is live (colocation). Until then no page makes that claim.
 */
export const OWN_DATA_CENTRE_LINE = "Run from our own data centre.";

export function withDataCentre(text: string, market: { ownDataCentre: boolean }): string {
  return market.ownDataCentre ? `${text} ${OWN_DATA_CENTRE_LINE}` : text;
}

/** Words that differ by market. Keyed by market code; anything missing uses the default. */
export interface MarketCopy {
  /**
   * For buyers who must keep data in the country. Shown only on the Data
   * protection service card and the Security page, never in the hero.
   */
  localHosting?: string;
  /** Real customer quotes only. The section stays hidden while this is empty. */
  testimonials: { quote: string; name: string; role: string }[];
}

export const MARKET_COPY: Record<string, MarketCopy> = {
  default: { testimonials: [] },
  bw: { localHosting: "Need a copy of your data kept in Botswana? We keep one for regulated customers.", testimonials: [] },
};

export function marketCopy(code: string): MarketCopy {
  return { ...MARKET_COPY.default, ...MARKET_COPY[code] };
}

/** The legal pages every market has. */
export const LEGAL_PAGES = {
  privacy: "Privacy notice",
  terms: "Terms of service",
  "data-protection": "Data protection",
} as const;

export type LegalKind = keyof typeof LEGAL_PAGES;
