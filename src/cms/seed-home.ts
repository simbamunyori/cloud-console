import type { Page } from "./payload-types";
import { SUPPORTING_LINE } from "@/config/positioning";
import { inPillarOrder } from "./pillars";
import { richFromMarkdown } from "./seed/legal-markdown";

/**
 * The home page as designed (docs/design/home-desktop.html and
 * home-phone.html), as the website editor's first content, one layout per
 * market. Added by seedWebsite (src/cms/seed). Sections with nothing
 * approved to show hide themselves: the plans until all three are on
 * sale, the insights until one is published, NSMC until its address is
 * set, the builder card until the builder is on sale.
 */

type Layout = NonNullable<Page["layout"]>;

const market = (label: string, path: string) => ({ label, to: "market" as const, path });
const site = (label: string, path: string) => ({ label, to: "site" as const, path });

const FAQS: { q: string; a: string; phone?: boolean }[] = [
  { q: "Can you move my existing email and website?", a: "Yes. We move your mailboxes, files and site across for you, with nothing lost." },
  { q: "Where is my data kept?", a: "Microsoft and Google data stays in their regional data centres. Our own platform runs on our servers, and our Security page lists exactly where." },
  { q: "What happens if I leave?", a: "You keep your domain and can export everything. We help you move, and monthly plans can be cancelled at any time." },
  { q: "Who answers after hours?", a: "Urgent issues such as email being down are watched around the clock. Everything else is answered the next business day." },
  { q: "What if my .co.bw name is taken?", a: "Search shows available alternatives and other endings, and our team can suggest names that fit.", phone: false },
  { q: "What if I only need a domain?", a: "Buy just the domain. Add email, a website or security whenever you are ready.", phone: false },
  { q: "How do I pay?", a: "By card or bank transfer, on one monthly invoice in your currency.", phone: false },
  { q: "Am I locked in?", a: "Monthly plans can be cancelled any time. Some Microsoft plans have annual terms, and we always show them before you buy." },
];

type Cell = [text: string, phone: string, included: boolean];
const row = (label: string, labelPhone: string, start: Cell, grow: Cell, protect: Cell) => ({
  label,
  labelPhone,
  start: start[0],
  startPhone: start[1],
  startIncluded: start[2],
  grow: grow[0],
  growPhone: grow[1],
  growIncluded: grow[2],
  protect: protect[0],
  protectPhone: protect[1],
  protectIncluded: protect[2],
});
const yes = (text: string, phone = "✓"): Cell => [text, phone, true];
const no = (text: string, phone = text): Cell => [text, phone, false];

/** Who we help (STRATEGY_ROLLOUT U2): the primary customer, then the three secondary segments. Hidden until a Publisher approves it. */
export const WHO_WE_HELP = () =>
  ({
    blockType: "whoWeHelp",
    anchor: "who-we-help",
    kicker: "Who we help",
    heading: "Built for businesses of 10 to 150 people.",
    intro: "Big enough to need proper IT, too small to run an IT department. We are that department: one account, one team, one invoice.",
    introPhone: "Big enough to need proper IT, too small to run an IT department. We are that department.",
    items: [
      {
        title: "Businesses of 10 to 150 people",
        body: "Email, devices, security and backup run by one team you can call by name, so your people get on with their work and you see every cost on one invoice.",
        bodyPhone: "Email, devices, security and backup run by one team, on one invoice.",
      },
      {
        title: "Professional services",
        body: "Law, accounting and consulting firms that hold client data: secure email, tested backups and records kept the way data protection law expects.",
        bodyPhone: "Secure email, tested backups and client records kept properly.",
      },
      {
        title: "Schools and colleges",
        body: "Accounts for staff and learners, protected devices and a website parents can rely on, looked after through the whole school year.",
        bodyPhone: "Staff and learner accounts, protected devices and a reliable website.",
      },
      {
        title: "Contractors",
        body: "Mid-tier construction, engineering and logistics firms: email and files that work on site, protected laptops and every approval on record.",
        bodyPhone: "Email and files that work on site, and every approval on record.",
      },
    ],
    approved: false,
  }) as Layout[number];

/** The proof section as designed, for home pages made before it existed. */
export const PROOF_STRIP = (): Layout[number] => homeLayout(DEFAULT_MARKET).find((b) => b.blockType === "proofStrip")!;
const DEFAULT_MARKET = "bw";

export function homeLayout(_market: string): Layout {
  return [
    {
      blockType: "homeHero",
      kicker: "Managed cloud for business",
      heading: "Everything your business needs online. Handled.",
      sub: "Domains, email, websites, security, cloud hosting, backup and disaster recovery. Set up by our team, looked after every day, and billed on one invoice in your currency.",
      subPhone: "Domains, email, websites, security, cloud hosting, backup and disaster recovery, set up and looked after by our team, on one invoice in your currency.",
      supporting: SUPPORTING_LINE,
      primary: site("Get started", "/sign-up"),
      secondary: market("Talk to our team", "/#team"),
      showConsole: true,
    },
    {
      blockType: "domainStore",
      anchor: "domains",
      kicker: "Domains",
      heading: "Start with your name.",
      intro: "Search once and see every ending that is free, with the price per year in your currency. Your domain comes with free security certificates and our team renews it for you.",
      example: "yourcompany",
    },
    {
      blockType: "proofStrip",
      anchor: "why",
      numbers: true,
      partnersHeading: "Partners and accreditations",
      clientsHeading: "Businesses we look after",
    },
    {
      blockType: "numberedServices",
      anchor: "services",
      kicker: "What we look after",
      heading: "The essentials your business runs on, in one place.",
      headingPhone: "The essentials your business runs on.",
      items: inPillarOrder([
        { title: "Domains", body: "Your name online, in .bw, .co.za, .com and hundreds more, renewed for you.", bodyPhone: "Your name online, in .bw, .co.za, .com and more, renewed for you.", link: market("Learn more", "/#domains") },
        { title: "Email and Microsoft 365", body: "Professional email, Teams and Office, or Google Workspace, set up and moved over.", bodyPhone: "Professional email, Teams and Office, or Google Workspace.", link: market("Learn more", "/#email") },
        { title: "Websites and stores", body: "Build it yourself in minutes or let our designers build it for you.", bodyPhone: "Build it yourself or let our designers build it for you.", link: market("Learn more", "/#websites") },
        { title: "Security", body: "Protection on every device, email security and monitoring, explained plainly.", bodyPhone: "Protection on every device and email, explained plainly.", link: market("Learn more", "/security") },
        {
          title: "Cloud hosting and backup",
          body: "Managed servers and hosted apps, daily backups we test every month, and disaster recovery to get you running again fast.",
          bodyPhone: "Managed servers, tested backups and disaster recovery.",
          link: market("Learn more", "/pricing#cat-servers"),
        },
        { title: "Expense management", body: "Thebe: staff requests, approval workflows and live spending, connected to your accounting.", bodyPhone: "Thebe: staff requests, approval workflows and live spending.", link: market("Learn more", "/#thebe") },
      ], (item) => item.title),
    },
    WHO_WE_HELP(),
    {
      blockType: "emailShowcase",
      anchor: "email",
      kicker: "Email and Microsoft 365",
      heading: "Look like a company on every email.",
      intro: "Professional email on your own name with Microsoft 365 or Google Workspace. We move your old mail across with nothing lost, and your branded signature appears on every device.",
      introPhone: "Professional email on your own name. We move your old mail across, and your branded signature appears on every device.",
      caption: "Same signature, every device",
    },
    {
      blockType: "websitesShowcase",
      anchor: "websites",
      kicker: "Websites and online stores",
      heading: "Your website, your way.",
      intro: "Describe your business and build it yourself in minutes, or hand it to our designers and approve the result. Either way it is hosted, secured and backed up by us.",
      cards: [
        {
          title: "Build it yourself",
          body: "Industry templates, an AI draft from a short description, and changes by simply asking. Sell online or take bookings.",
          bodyPhone: "Templates for your industry and an AI draft from a short description.",
          link: site("Try the builder", "/app/marketplace"),
          // The website builder arrives in a later milestone; this card waits for it.
          products: { categories: [], products: ["website-builder"] },
        },
        { title: "We build it for you", body: "Our designers build your site, write the pages with you and launch it. You approve every step.", bodyPhone: "Our designers build and launch it. You approve every step.", link: market("Request a quote", "/quote") },
      ],
      industries: ["Law firms", "Restaurants and cafés", "Events", "Creative portfolios", "Beauty and wellness", "Online stores"].map((name) => ({ name })),
    },
    {
      blockType: "securityPanel",
      anchor: "security",
      kicker: "Security",
      heading: "Protected, without the jargon.",
      intro: "Two-step login on every account, protection on every device, and backups we test every month. One score shows where you stand, and we fix what needs fixing.",
    },
    {
      blockType: "thebeSection",
      anchor: "thebe",
      kicker: "Our software · Expense management",
      kickerPhone: "Expense management",
      heading: "Every request approved properly. Every payment accounted for.",
      intro: "Thebe replaces email and paper requisitions. Staff raise requests from their phone, the right people approve them in order, and you always see what has been spent, what is committed and what is left.",
      introPhone: "Staff raise requests from their phone, the right people approve them, and you always see what is spent, committed and left.",
      features: [
        { title: "Requests from anywhere", body: "Staff raise requests from their phone, with quotes and receipts attached." },
        { title: "Approval workflows", body: "Routed by team, amount and budget. Nobody approves their own request." },
        { title: "Live budgets and spending", body: "See what is spent, committed and left, per team and per company." },
        { title: "Ask Thebe", body: "Ask in plain words: what did we spend this week, and on what?" },
        { title: "Connects to your accounting", body: "Approved spending flows to Xero, Sage Pastel and QuickBooks.", accounting: true },
        { title: "A full audit trail", body: "Every request, approval and payment recorded, ready for your auditors." },
      ],
      showAccounting: false,
    },
    {
      blockType: "plansTable",
      anchor: "plans",
      kicker: "Plans",
      heading: "One price for the whole business.",
      intro: "A monthly price per business plus a price per user, so you always know what you pay. Add or remove users any time.",
      introPhone: "A monthly price per business plus a price per user. Microsoft and Google licences show as their own lines on your invoice.",
      rows: [
        row("Domain name", "Domain", yes("1 included"), yes("1 included"), yes("1 included")),
        row("Business email", "Email", no("Basic mailbox", "Basic"), yes("Microsoft 365 or Google Workspace", "365"), yes("Microsoft 365 Business Premium", "Premium")),
        row("Website", "Website", no("Builder", "✓"), yes("Builder with online store", "Store"), yes("Builder with online store", "Store")),
        row("Branded signatures", "Signatures", no("Add-on"), yes("Every device"), yes("Every device")),
        row("Disaster recovery", "Disaster recovery", no("Add-on"), no("Add-on"), yes("Included")),
        row("Daily backup", "Daily backup", no("Add-on"), yes("Included"), yes("Included")),
        row("Email security", "Email security", no("Standard"), no("Standard"), yes("Advanced")),
        row("Device protection and monitoring", "Device protection", no("Add-on"), no("Add-on"), yes("Every device")),
        row("Setup and migration by our team", "Setup by our team", yes("Included"), yes("Included"), yes("Included")),
        row("Support", "Support", no("Business hours", "Hours"), yes("Priority"), yes("Priority, urgent issues around the clock", "24/7 urgent")),
      ],
      footnote: "Microsoft 365 and Google Workspace licences appear as their own lines on your invoice. Setup, migration, support and management are included in the plan price. Add-ons can be added to any plan.",
      users: 8,
    },
    {
      blockType: "compareTable",
      kicker: "Why not just use free tools?",
      heading: "Free gets you started. We keep you running.",
      freeHeading: "Free tools on your own",
      usHeading: "Fourth Generation",
      rows: [
        { label: "A person to call when something breaks", free: "Forums and FAQs", us: "Our team, by name", labelPhone: "A person to call", freePhone: "forums and FAQs", usPhone: "our team, by name" },
        { label: "Your own domain and professional email", free: "Extra setup, extra bills", us: "Included and set up", labelPhone: "Own domain and email", freePhone: "extra setup and bills", usPhone: "included and set up" },
        { label: "Security set up and watched", free: "Up to you", us: "Done for you", labelPhone: "Security", freePhone: "up to you", usPhone: "done for you" },
        { label: "Backups that are tested", free: "Rarely", us: "Every month", labelPhone: "Tested backups", freePhone: "rarely", usPhone: "every month" },
        { label: "Billing", free: "Several foreign-currency charges", us: "One invoice in your currency", freePhone: "several foreign charges", usPhone: "one invoice, your currency" },
        { label: "When you grow", free: "Start again elsewhere", us: "Add users and services in a click", freePhone: "start again elsewhere", usPhone: "add users in a click" },
      ],
    },
    {
      blockType: "teamSection",
      anchor: "team",
      kicker: "A real team that answers",
      heading: "People you can call by name.",
      intro: "Our support team replies by phone, email or chat from 07:30 to 17:30 on weekdays. Urgent issues are watched around the clock.",
      introPhone: "Support 07:30 to 17:30 on weekdays, urgent issues watched around the clock.",
      replyLine: "Our median first reply over the last 90 days is {time}.",
      link: { label: "Contact support", to: "email", subject: "Support" },
      nsmc: {
        lead: "Need on-site IT, networks or infrastructure?",
        leadPhone: "Need on-site IT or infrastructure?",
        text: "Our sister company NSMC designs, installs and supports them.",
        textPhone: "Our sister company NSMC designs, installs and supports it.",
        linkLabel: "Visit NSMC",
      },
    },
    {
      blockType: "insightsStrip",
      anchor: "insights",
      kicker: "Insights",
      heading: "Practical advice for running your business online.",
      headingPhone: "Practical advice for your business online.",
      tone: "plain",
    },
    {
      blockType: "faq",
      kicker: "Questions",
      heading: "Good to know before you start.",
      headingPhone: "Good to know.",
      tone: "light",
      items: FAQS.map((f) => ({ question: f.q, answer: richFromMarkdown(f.a) as never, showOnPhone: f.phone ?? true })),
      more: market("Visit the help centre", "/help"),
    },
    {
      blockType: "closingBanner",
      heading: "Everything your business needs online. Handled.",
      primary: site("Get started", "/sign-up"),
    },
  ] as Layout;
}
