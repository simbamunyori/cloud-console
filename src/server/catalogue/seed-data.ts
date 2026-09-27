import type { ConnectorFamily, PrismaClient } from "@prisma/client";
import type { StubProductKey } from "@/server/billing/stub/catalogue";
import { bookRows } from "./price-book";

/**
 * The launch catalogue from the brief. Costs, margins, the buffer and the
 * exchange rate are PLACEHOLDERS for development: staff set the real ones
 * in the admin console. Every product has a plain name, a monthly price
 * and what is and isn't included.
 */

export interface OptionSpec {
  key: string;
  label: string;
  type: "text" | "select";
  required: boolean;
  hint?: string;
  choices?: string[];
  /** For text: "domain" checks it looks like a domain name. */
  format?: "domain";
}

interface CategorySeed {
  key: string;
  name: string;
  description: string;
  family: ConnectorFamily;
  marginBps: number;
  sortOrder: number;
}

interface ProductSeed {
  slug: string;
  category: string;
  name: string;
  summary: string;
  includes: string[];
  excludes: string[];
  unitLabel: string;
  quantityAllowed?: boolean;
  minQuantity?: number;
  cost: [bigint, string];
  fixedPrice?: [bigint, string];
  setupHours: number;
  commitmentNote?: string;
  billing: StubProductKey;
  options?: OptionSpec[];
  /** Markets it is offered in when first loaded. Every market if not set. */
  markets?: string[];
}

/** The product behind domain orders. It isn't shown in the product grid; domains have their own search. */
export const DOMAIN_PRODUCT_SLUG = "domain-name";

const EMAIL_DOMAIN: OptionSpec = {
  key: "domain",
  label: "Your email domain",
  type: "text",
  required: true,
  format: "domain",
  hint: "The part after @ in your email addresses, like yourcompany.co.bw. We'll guide you through proving you own it.",
};

const SEAT_TERMS = "Billed monthly. Add users at any time; the part month is charged on your next invoice. Reduce users from your next renewal date.";

export const CATEGORIES: CategorySeed[] = [
  { key: "productivity", name: "Productivity", description: "Email, documents and meetings for your team.", family: "PRODUCTIVITY", marginBps: 2000, sortOrder: 1 },
  { key: "servers", name: "Servers", description: "Managed servers in our own data centre.", family: "SERVERS", marginBps: 4000, sortOrder: 2 },
  { key: "web", name: "Web and domains", description: "Websites, business email and domain names.", family: "WEB_AND_DOMAINS", marginBps: 4000, sortOrder: 3 },
  { key: "protection", name: "Protection", description: "Backups, recovery and security monitoring.", family: "PROTECTION", marginBps: 3500, sortOrder: 4 },
  { key: "public-cloud", name: "Public cloud", description: "Microsoft Azure, set up and looked after by us.", family: "PUBLIC_CLOUD", marginBps: 1500, sortOrder: 5 },
  { key: "our-software", name: "Our software", description: "Software we build and run on our own platform.", family: "OUR_SOFTWARE", marginBps: 0, sortOrder: 6 },
  { key: "services", name: "Services", description: "Help from our team, every month.", family: "SERVICES", marginBps: 0, sortOrder: 7 },
];

const m365 = (slug: string, name: string, cost: bigint, billing: StubProductKey, summary: string, includes: string[]): ProductSeed => ({
  slug,
  category: "productivity",
  name,
  summary,
  includes: [...includes, "Set up by us, with help moving your existing email"],
  excludes: ["Desktop support for your computers (see Managed support plan)"],
  unitLabel: "per user",
  quantityAllowed: true,
  cost: [cost, "USD"],
  setupHours: 8,
  commitmentNote: SEAT_TERMS,
  billing,
  options: [EMAIL_DOMAIN],
});

const gws = (slug: string, name: string, cost: bigint, billing: StubProductKey, summary: string, includes: string[]): ProductSeed => ({
  ...m365(slug, name, cost, billing, summary, includes),
});

export const PRODUCTS: ProductSeed[] = [
  m365("microsoft-365-business-basic", "Microsoft 365 Business Basic", 600n, "m365-basic", "Email, Teams and Office on the web.", ["50 GB mailbox per user", "Teams meetings and chat", "Word, Excel and PowerPoint in the browser and on phones", "1 TB OneDrive storage per user"]),
  m365("microsoft-365-business-standard", "Microsoft 365 Business Standard", 1250n, "m365-standard", "Everything in Basic, plus the Office desktop apps.", ["Everything in Business Basic", "Word, Excel, PowerPoint and Outlook on up to 5 computers per user", "Webinars and bookings"]),
  m365("microsoft-365-business-premium", "Microsoft 365 Business Premium", 2200n, "m365-premium", "Everything in Standard, plus advanced security.", ["Everything in Business Standard", "Defender for Business", "Intune device management", "Conditional access"]),
  gws("google-workspace-business-starter", "Google Workspace Business Starter", 700n, "gws-starter", "Gmail, Meet and Docs with your own domain.", ["30 GB storage per user", "Gmail with your domain", "Meet video calls for up to 100 people"]),
  gws("google-workspace-business-standard", "Google Workspace Business Standard", 1400n, "gws-standard", "More storage and recorded meetings.", ["2 TB storage per user", "Meet recordings", "Shared drives"]),
  gws("google-workspace-business-plus", "Google Workspace Business Plus", 2200n, "gws-plus", "More storage, Vault and extra security.", ["5 TB storage per user", "Vault for keeping and searching email", "Advanced endpoint management"]),
  {
    slug: "managed-vps-small",
    category: "servers",
    name: "Managed VPS, small",
    summary: "2 processors, 4 GB memory, 80 GB fast storage.",
    includes: ["Hosted in Gaborone", "Operating system updates by us", "Daily snapshot kept for 7 days", "Monitoring around the clock"],
    excludes: ["Software you install yourself", "Server backup kept longer than 7 days (see Server backup)"],
    unitLabel: "per server",
    cost: [30000n, "BWP"],
    setupHours: 4,
    commitmentNote: "Billed monthly. Cancel at the end of any month.",
    billing: "vps-small",
    options: [{ key: "os", label: "Operating system", type: "select", required: true, choices: ["Ubuntu 24.04 LTS", "Debian 12", "Windows Server 2022"] }],
  },
  {
    slug: "managed-vps-medium",
    category: "servers",
    name: "Managed VPS, medium",
    summary: "4 processors, 8 GB memory, 160 GB fast storage.",
    includes: ["Hosted in Gaborone", "Operating system updates by us", "Daily snapshot kept for 7 days", "Monitoring around the clock"],
    excludes: ["Software you install yourself", "Server backup kept longer than 7 days (see Server backup)"],
    unitLabel: "per server",
    cost: [56000n, "BWP"],
    setupHours: 4,
    commitmentNote: "Billed monthly. Cancel at the end of any month.",
    billing: "vps-medium",
    options: [{ key: "os", label: "Operating system", type: "select", required: true, choices: ["Ubuntu 24.04 LTS", "Debian 12", "Windows Server 2022"] }],
  },
  {
    slug: "managed-vps-large",
    category: "servers",
    name: "Managed VPS, large",
    summary: "8 processors, 16 GB memory, 320 GB fast storage.",
    includes: ["Hosted in Gaborone", "Operating system updates by us", "Daily snapshot kept for 7 days", "Monitoring around the clock"],
    excludes: ["Software you install yourself", "Server backup kept longer than 7 days (see Server backup)"],
    unitLabel: "per server",
    cost: [110000n, "BWP"],
    setupHours: 4,
    commitmentNote: "Billed monthly. Cancel at the end of any month.",
    billing: "vps-large",
    options: [{ key: "os", label: "Operating system", type: "select", required: true, choices: ["Ubuntu 24.04 LTS", "Debian 12", "Windows Server 2022"] }],
  },
  {
    slug: "web-hosting",
    category: "web",
    name: "Web hosting",
    summary: "A fast home for your website.",
    includes: ["20 GB storage", "Free SSL certificate", "Daily backups", "Control panel"],
    excludes: ["Building the website", "Domain name (search for one below)"],
    unitLabel: "per site",
    cost: [8000n, "BWP"],
    setupHours: 2,
    billing: "web-hosting",
    options: [{ key: "domain", label: "Website address", type: "text", required: true, format: "domain", hint: "Like yourcompany.co.bw. Register one first if you need to." }],
  },
  {
    slug: "wordpress-hosting",
    category: "web",
    name: "WordPress hosting",
    summary: "WordPress, installed and kept up to date.",
    includes: ["WordPress installed for you", "Automatic updates", "Free SSL certificate", "Daily backups"],
    excludes: ["Designing the site", "Paid plugins and themes"],
    unitLabel: "per site",
    cost: [15000n, "BWP"],
    setupHours: 2,
    billing: "wordpress-hosting",
    options: [{ key: "domain", label: "Website address", type: "text", required: true, format: "domain" }],
  },
  {
    slug: "business-email",
    category: "web",
    name: "Business email",
    summary: "Simple email on your own domain.",
    includes: ["10 GB mailbox", "Works with Outlook and phone mail apps", "Spam and virus filtering"],
    excludes: ["Office apps and Teams (see Microsoft 365)"],
    unitLabel: "per mailbox",
    quantityAllowed: true,
    cost: [3000n, "BWP"],
    setupHours: 2,
    commitmentNote: "Billed monthly. Add or remove mailboxes at any time.",
    billing: "business-email",
    options: [EMAIL_DOMAIN],
  },
  {
    slug: "ssl-certificate",
    category: "web",
    name: "SSL certificate",
    summary: "An organisation-validated certificate for sites that need more than the free one.",
    includes: ["Organisation validation", "Installed for you on our hosting"],
    excludes: ["Installation on servers we don't manage"],
    unitLabel: "per site",
    cost: [4000n, "BWP"],
    setupHours: 24,
    billing: "ssl",
    options: [{ key: "domain", label: "Website address", type: "text", required: true, format: "domain" }],
  },
  {
    slug: "backup-microsoft-365",
    category: "protection",
    name: "Backup for Microsoft 365",
    summary: "A copy of every mailbox, OneDrive and SharePoint site, kept for a year.",
    includes: ["Daily backups", "Kept for 1 year", "Restore a single email or a whole mailbox"],
    excludes: ["Backups of computers and servers"],
    unitLabel: "per user",
    quantityAllowed: true,
    cost: [250n, "USD"],
    setupHours: 4,
    commitmentNote: SEAT_TERMS,
    billing: "backup-m365",
  },
  {
    slug: "backup-google-workspace",
    category: "protection",
    name: "Backup for Google Workspace",
    summary: "A copy of Gmail, Drive and shared drives, kept for a year.",
    includes: ["Daily backups", "Kept for 1 year", "Restore a single file or a whole account"],
    excludes: ["Backups of computers and servers"],
    unitLabel: "per user",
    quantityAllowed: true,
    cost: [250n, "USD"],
    setupHours: 4,
    commitmentNote: SEAT_TERMS,
    billing: "backup-gws",
  },
  {
    slug: "server-backup",
    category: "protection",
    name: "Server backup",
    summary: "Nightly backups of one server, kept for 30 days in a second site.",
    includes: ["Nightly backup", "Kept for 30 days", "A test restore every month, with the result recorded"],
    excludes: ["Servers outside our data centre (ask us)"],
    unitLabel: "per server",
    cost: [18000n, "BWP"],
    setupHours: 8,
    billing: "backup-server",
  },
  {
    slug: "disaster-recovery",
    category: "protection",
    name: "Disaster recovery",
    summary: "Your servers ready to start in a second site if the first one fails.",
    includes: ["Copies kept up to date every 15 minutes", "A recovery test every quarter", "A written recovery plan"],
    excludes: ["Servers we don't host"],
    unitLabel: "per server",
    cost: [85000n, "BWP"],
    setupHours: 40,
    billing: "disaster-recovery",
  },
  {
    slug: "local-data-copy",
    // The copy is kept in Botswana.
    markets: ["bw"],
    category: "protection",
    name: "Local data copy",
    summary: "A daily copy of your cloud data kept on our own servers, for organisations with data protection duties.",
    includes: ["Daily copy of Microsoft 365 or Google Workspace data", "Stored in Gaborone", "A yearly report for your records"],
    excludes: ["Legal advice"],
    unitLabel: "per organisation",
    cost: [20000n, "BWP"],
    setupHours: 8,
    billing: "local-data-copy",
  },
  {
    slug: "managed-detection-response",
    category: "protection",
    name: "Managed detection and response",
    summary: "Security software on each computer, watched by our team around the clock.",
    includes: ["Security agent for each computer", "Alerts watched 24 hours a day", "We isolate an infected computer for you"],
    excludes: ["Rebuilding computers after an incident (charged separately)"],
    unitLabel: "per device",
    quantityAllowed: true,
    cost: [800n, "USD"],
    setupHours: 8,
    commitmentNote: "Billed monthly. Add devices at any time.",
    billing: "mdr",
  },
  {
    slug: "azure-managed",
    category: "public-cloud",
    name: "Azure subscription, managed",
    summary: "An Azure subscription set up and looked after by us.",
    includes: ["Set-up with sensible security defaults", "Monthly cost review", "Support from our cloud team"],
    excludes: ["Azure usage (billed separately at cost plus margin once your spend view is live)"],
    unitLabel: "per subscription",
    cost: [0n, "BWP"],
    fixedPrice: [150000n, "BWP"],
    setupHours: 24,
    commitmentNote: "Billed monthly for management. Azure usage is billed on top.",
    billing: "azure-managed",
  },
  {
    slug: "thebe",
    category: "our-software",
    name: "Thebe",
    summary: "Accounting and payroll for Botswana businesses.",
    includes: ["All Thebe features", "Hosted on our own platform", "Support by email and phone"],
    excludes: ["Moving your old records in (ask about a migration)"],
    unitLabel: "per organisation",
    cost: [0n, "BWP"],
    fixedPrice: [65000n, "BWP"],
    setupHours: 4,
    billing: "thebe",
  },
  {
    slug: "managed-support",
    category: "services",
    name: "Managed support plan",
    summary: "Help for your team's computers and accounts, by phone, email and remotely.",
    includes: ["Up to 25 users", "Help desk on working days, 8:00 to 17:00", "Monthly health report"],
    excludes: ["Visits on site (charged per hour)", "New hardware"],
    unitLabel: "per organisation",
    cost: [0n, "BWP"],
    fixedPrice: [150000n, "BWP"],
    setupHours: 16,
    commitmentNote: "Billed monthly. Three months' notice to cancel.",
    billing: "managed-support",
  },
  {
    slug: DOMAIN_PRODUCT_SLUG,
    category: "web",
    name: "Domain name",
    summary: "A web address for your site and email.",
    includes: ["Registration", "DNS hosting"],
    excludes: [],
    unitLabel: "per domain",
    cost: [0n, "BWP"],
    fixedPrice: [0n, "BWP"],
    setupHours: 4,
    // Domain orders go through registerDomain; this links the catalogue entry to its billing product.
    billing: "domain-registration",
  },
];

/**
 * Domain endings we sell and what the registrar charges us, in US dollars.
 * Country endings are offered in their own market; the rest everywhere.
 * Placeholder costs until the registrar's price list is loaded.
 */
export const TLDS: { tld: string; register: bigint; renew: bigint; markets?: string[] }[] = [
  { tld: ".co.bw", register: 1000n, renew: 1000n, markets: ["bw"] },
  { tld: ".bw", register: 2000n, renew: 2000n, markets: ["bw"] },
  { tld: ".co.za", register: 600n, renew: 600n, markets: ["za"] },
  { tld: ".co.zw", register: 1100n, renew: 1100n, markets: ["zw"] },
  { tld: ".com", register: 1100n, renew: 1250n },
  { tld: ".africa", register: 1600n, renew: 1600n },
  { tld: ".net", register: 1250n, renew: 1400n },
  { tld: ".org", register: 1100n, renew: 1300n },
  { tld: ".io", register: 3500n, renew: 3500n },
];

/** Placeholder pricing settings for development. */
export const PLACEHOLDER_BUFFER_BPS = 300;
/** Placeholder exchange rates, 1 base in quote times 1,000,000, until staff enter the month's rates. */
export const PLACEHOLDER_RATES: { base: string; quote: string; rateMicros: bigint }[] = [
  { base: "USD", quote: "BWP", rateMicros: 13_450_000n },
  { base: "USD", quote: "ZAR", rateMicros: 18_200_000n },
  { base: "BWP", quote: "ZAR", rateMicros: 1_350_000n },
  { base: "BWP", quote: "USD", rateMicros: 74_400n },
];

/**
 * Loads the catalogue. Leaves existing categories' margins, products'
 * prices and where they're offered alone (staff may have changed them);
 * adds what is missing. `billingIds` maps the stub's product keys to
 * billing product ids. Then fills any empty price book with the
 * suggestions for the first month given, as if approved.
 */
export async function seedCatalogue(db: PrismaClient, billingIds: Partial<Record<StubProductKey, string>>, months: string[]) {
  const allMarkets = (await db.market.findMany({ orderBy: { sortOrder: "asc" }, select: { code: true } })).map((m) => m.code);
  for (const c of CATEGORIES) {
    await db.productCategory.upsert({ where: { key: c.key }, update: { name: c.name, description: c.description, family: c.family, sortOrder: c.sortOrder }, create: c });
  }
  for (const [i, p] of PRODUCTS.entries()) {
    const billingProductId = billingIds[p.billing];
    if (!billingProductId) throw new Error(`No billing product for ${p.slug}.`);
    const data = {
      categoryKey: p.category,
      name: p.name,
      summary: p.summary,
      includes: p.includes,
      excludes: p.excludes,
      unitLabel: p.unitLabel,
      quantityAllowed: p.quantityAllowed ?? false,
      minQuantity: p.minQuantity ?? 1,
      setupHours: p.setupHours,
      commitmentNote: p.commitmentNote ?? null,
      options: (p.options ?? []) as unknown as object,
      sortOrder: i,
    };
    await db.product.upsert({
      where: { slug: p.slug },
      update: data,
      create: {
        ...data,
        slug: p.slug,
        costMinor: p.cost[0],
        costCurrency: p.cost[1],
        fixedPriceMinor: p.fixedPrice?.[0] ?? null,
        fixedPriceCurrency: p.fixedPrice?.[1] ?? null,
        billingProductId,
        markets: p.markets ?? allMarkets,
      },
    });
  }
  for (const [i, t] of TLDS.entries()) {
    await db.tld.upsert({
      where: { tld: t.tld },
      update: { sortOrder: i },
      create: { tld: t.tld, costRegisterMinor: t.register, costRenewMinor: t.renew, costCurrency: "USD", markets: t.markets ?? allMarkets, sortOrder: i },
    });
  }
  await db.pricingSettings.upsert({ where: { id: "global" }, update: {}, create: { id: "global", currencyBufferBps: PLACEHOLDER_BUFFER_BPS } });
  for (const month of months) {
    for (const r of PLACEHOLDER_RATES) {
      await db.fxRate.upsert({ where: { month_base_quote: { month, base: r.base, quote: r.quote } }, update: {}, create: { month, ...r } });
    }
  }
  const first = [...months].sort()[0];
  if (first) for (const code of allMarkets) await seedPriceBook(db, code, first);
}

/** Prices everything without a price in a market from the month's suggestions, marked as seeded (no approver). */
async function seedPriceBook(db: PrismaClient, marketCode: string, month: string) {
  const { rows, market } = await bookRows(db, marketCode, month);
  for (const r of rows) {
    if (r.current || !r.suggestion) continue;
    await db.priceBookEntry.upsert({
      where: { marketCode_item_month: { marketCode, item: r.item, month } },
      update: {},
      create: {
        marketCode,
        item: r.item,
        month,
        currency: market.currency,
        amountMinor: r.suggestion.price.amountMinor,
        renewMinor: r.suggestion.renew?.amountMinor ?? null,
        suggestedMinor: r.suggestion.price.amountMinor,
        breakdown: r.suggestion.breakdown as unknown as object,
      },
    });
  }
}
