import type { Block, Field } from "payload";
import { link, text, textarea } from "../fields";

/**
 * The home page's sections, as designed (docs/design/home-desktop.html and
 * home-phone.html). Each is drawn only one way, the design's; editors
 * choose the words, and where phones need shorter words, a phone version.
 * Pictures of the console, Thebe and the demo customers are drawn by the
 * site itself. Each section hides what has nothing approved to show.
 */

const anchor: Field = {
  name: "anchor",
  type: "text",
  admin: { description: "Optional. Lets a link jump here, e.g. domains for /bw#domains." },
  validate: (v: unknown) => (!v || /^[a-z][a-z0-9-]*$/.test(String(v)) ? true : "Lower-case letters, numbers and dashes."),
};

/** Words for phones, when the design shortens them. Empty uses the main words. */
const phone = (name: string, maxLength: number, big = false, description = "Optional. Phones show these instead."): Field => ({
  ...(big ? textarea(name, { label: "Shorter words for phones", maxLength }) : text(name, { label: "Shorter words for phones", maxLength })),
  admin: { description },
});

const sectionHeading = (o: { intro?: boolean } = { intro: true }): Field[] => [
  anchor,
  text("kicker", { label: "Small heading above", maxLength: 60 }),
  text("heading", { required: true, maxLength: 140 }),
  phone("headingPhone", 140),
  ...(o.intro ? [textarea("intro", { label: "Introduction", maxLength: 400 }), phone("introPhone", 300, true, "Optional. Phones show these instead; left empty, phones show no introduction, as designed.")] : []),
];

/** Products a card or link is about: it shows only while one of them is on sale. Chosen from the catalogue. */
const onSale = (label = "Only while these are on sale"): Field => ({
  name: "products",
  label,
  type: "json",
  admin: {
    description: "Optional. Tick the products this is about: it shows only while one of them is live and priced in the market.",
    components: { Field: "@/cms/components/catalogue-picker#CataloguePicker" },
  },
});

export const HomeHero: Block = {
  slug: "homeHero",
  labels: { singular: "Home: hero with the console", plural: "Home: heroes" },
  interfaceName: "HomeHeroBlock",
  fields: [
    text("kicker", { label: "Small heading above", maxLength: 60 }),
    text("heading", { required: true, maxLength: 80 }),
    textarea("sub", { label: "Introduction", maxLength: 300 }),
    phone("subPhone", 300, true),
    link("primary", "Main button"),
    link("secondary", "Second link"),
    { name: "showConsole", label: "Show the console with demo data under the hero", type: "checkbox", defaultValue: true },
  ],
};

export const DomainStore: Block = {
  slug: "domainStore",
  labels: { singular: "Home: domain search with cart", plural: "Home: domain searches" },
  interfaceName: "DomainStoreBlock",
  fields: [...sectionHeading(), text("example", { label: "Example name in the empty search box", maxLength: 40 })],
};

export const NumberedServices: Block = {
  slug: "numberedServices",
  labels: { singular: "Home: what we look after (numbered)", plural: "Home: what we look after" },
  interfaceName: "NumberedServicesBlock",
  fields: [
    ...sectionHeading({ intro: false }),
    {
      name: "items",
      type: "array",
      minRows: 1,
      maxRows: 6,
      fields: [text("title", { required: true, maxLength: 40 }), textarea("body", { maxLength: 200 }), phone("bodyPhone", 140, true), link("link", "Link")],
    },
  ],
};

export const EmailShowcase: Block = {
  slug: "emailShowcase",
  labels: { singular: "Home: email signature on a laptop and phone", plural: "Home: email showcases" },
  interfaceName: "EmailShowcaseBlock",
  admin: { disableBlockName: true },
  fields: [...sectionHeading(), text("caption", { label: "Line under the phone", maxLength: 60 })],
  // The Microsoft partner badge joins from Partners and accreditations once approved (Milestone 4).
};

export const WebsitesShowcase: Block = {
  slug: "websitesShowcase",
  labels: { singular: "Home: websites with the example site", plural: "Home: websites showcases" },
  interfaceName: "WebsitesShowcaseBlock",
  fields: [
    ...sectionHeading(),
    {
      name: "cards",
      type: "array",
      maxRows: 2,
      fields: [text("title", { required: true, maxLength: 40 }), textarea("body", { maxLength: 200 }), phone("bodyPhone", 140, true), link("link", "Link"), onSale("Only while these are on sale")],
    },
    { name: "industries", label: "Industries", type: "array", maxRows: 8, fields: [text("name", { required: true, maxLength: 40 })] },
  ],
};

export const SecurityPanel: Block = {
  slug: "securityPanel",
  labels: { singular: "Home: security with the console's score", plural: "Home: security panels" },
  interfaceName: "SecurityPanelBlock",
  fields: sectionHeading(),
};

export const ThebeSection: Block = {
  slug: "thebeSection",
  labels: { singular: "Home: Thebe, in Thebe's brand", plural: "Home: Thebe sections" },
  interfaceName: "ThebeSectionBlock",
  fields: [
    ...sectionHeading(),
    phone("kickerPhone", 60),
    {
      name: "features",
      type: "array",
      maxRows: 6,
      fields: [
        text("title", { required: true, maxLength: 40 }),
        textarea("body", { maxLength: 160 }),
        { name: "accounting", label: "This is the accounting connection", type: "checkbox", defaultValue: false, admin: { description: "Shows only while the switch below is on." } },
      ],
    },
    {
      name: "showAccounting",
      label: "Thebe connects to Sage, QuickBooks and Xero",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "Leave off until those connections exist in Thebe. The accounting feature stays hidden while it is off." },
    },
    // Try Thebe goes to Website, Thebe links (or THEBE_TRY_URL); Learn more to THEBE_URL. Both default to Thebe's website.
  ],
};

const cell = (name: string, label: string): Field[] => [text(name, { label, maxLength: 60 }), text(`${name}Phone`, { label: `${label}, on phones`, maxLength: 16 }), { name: `${name}Included`, label: `${label}: included (green)`, type: "checkbox", defaultValue: false }];

export const PlansTable: Block = {
  slug: "plansTable",
  labels: { singular: "Home: plans comparison", plural: "Home: plans comparisons" },
  interfaceName: "PlansTableBlock",
  admin: { disableBlockName: true },
  fields: [
    ...sectionHeading(),
    {
      name: "rows",
      type: "array",
      maxRows: 14,
      admin: { description: "Prices come from the price books: each plan's price per business and per user. The section hides until all three plans are on sale in the market." },
      fields: [text("label", { required: true, maxLength: 60 }), text("labelPhone", { label: "Label on phones", maxLength: 24 }), ...cell("start", "Start"), ...cell("grow", "Grow"), ...cell("protect", "Protect")],
    },
    textarea("footnote", { label: "Licence note under the table", maxLength: 300 }),
    { name: "users", label: "Users in the estimate to start with", type: "number", defaultValue: 8, min: 1, max: 300 },
  ],
};

export const CompareTable: Block = {
  slug: "compareTable",
  labels: { singular: "Home: free tools compared", plural: "Home: comparisons" },
  interfaceName: "CompareTableBlock",
  fields: [
    ...sectionHeading({ intro: false }),
    text("freeHeading", { label: "Heading over the first column", maxLength: 40 }),
    text("usHeading", { label: "Heading over our column", maxLength: 40 }),
    {
      name: "rows",
      type: "array",
      maxRows: 10,
      fields: [text("label", { required: true, maxLength: 60 }), text("free", { required: true, maxLength: 60 }), text("us", { required: true, maxLength: 60 }), phone("labelPhone", 40), phone("freePhone", 40), phone("usPhone", 40)],
    },
  ],
};

export const TeamSection: Block = {
  slug: "teamSection",
  labels: { singular: "Home: our team", plural: "Home: team sections" },
  interfaceName: "TeamSectionBlock",
  fields: [
    ...sectionHeading(),
    link("link", "Link under the introduction"),
    {
      name: "nsmc",
      label: "Sister company line",
      type: "group",
      admin: { description: "Links to NSMC's website, https://www.nsmc.africa." },
      fields: [
        text("lead", { label: "Bold start", maxLength: 80 }),
        text("text", { maxLength: 140 }),
        phone("leadPhone", 60),
        phone("textPhone", 120),
        text("linkLabel", { label: "Words on the link", maxLength: 30 }),
      ],
    },
    text("replyLine", {
      label: "Median first reply sentence",
      maxLength: 140,
      description: "Optional. Shown after the introduction once the last 90 days have at least 30 answered tickets; {time} becomes the median, e.g. 12 minutes.",
    }),
    // Photos, names and roles come from Team members (Proof), shown when they have a photo and are visible.
  ],
};

/** The proof under the domain search: numbers, partner badges and client logos, each hidden while it has nothing approved. */
export const ProofStrip: Block = {
  slug: "proofStrip",
  labels: { singular: "Home: proof (numbers, partners and clients, edited under Proof)", plural: "Home: proof sections" },
  interfaceName: "ProofStripBlock",
  fields: [
    anchor,
    { name: "numbers", label: "Show the proof numbers", type: "checkbox", defaultValue: true },
    text("partnersHeading", { label: "Heading over the partner badges", maxLength: 60 }),
    text("clientsHeading", { label: "Heading over the client logos", maxLength: 60 }),
    // The numbers, badges and logos themselves are edited under Proof in the sidebar.
  ],
};

export const ClosingBanner: Block = {
  slug: "closingBanner",
  labels: { singular: "Home: closing banner", plural: "Home: closing banners" },
  interfaceName: "ClosingBannerBlock",
  admin: { disableBlockName: true },
  fields: [text("heading", { required: true, maxLength: 120 }), link("primary", "Button")],
};

export const HOME_BLOCKS: Block[] = [HomeHero, DomainStore, ProofStrip, NumberedServices, EmailShowcase, WebsitesShowcase, SecurityPanel, ThebeSection, PlansTable, CompareTable, TeamSection, ClosingBanner];
