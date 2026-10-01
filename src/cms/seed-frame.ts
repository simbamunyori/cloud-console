import type { Footer, Header } from "./payload-types";

/**
 * The header and footer as designed (docs/design/home-desktop.html): the
 * editor's first content, and what the site shows while the editor has
 * none. Links about a product show only while it is live and priced in
 * the market; links to the help centre only once it has articles.
 */

type Link = { label: string; to: "market" | "site" | "email" | "thebe"; path?: string; subject?: string };
const market = (label: string, path: string): { link: Link } => ({ link: { label, to: "market", path } });
const site = (label: string, path: string): { link: Link } => ({ link: { label, to: "site", path } });
const thebe = (label: string): { link: Link } => ({ link: { label, to: "thebe" } });

type MenuLink = { link: Link; description: string; products?: { categories: string[]; products: string[] } };
const item = (row: { link: Link }, description: string, products?: string[]): MenuLink => ({ ...row, description, ...(products ? { products: { categories: [], products } } : {}) });

const M365 = ["microsoft-365-business-basic", "microsoft-365-business-standard", "microsoft-365-business-premium"];
const GWS = ["google-workspace-business-starter", "google-workspace-business-standard", "google-workspace-business-plus"];

export const DEFAULT_HEADER = {
  menus: [
    {
      label: "Domains",
      right: false,
      columns: [
        {
          heading: "Your name online",
          links: [
            item(market("Register a domain", "/#domains"), "Search every ending and see the price per year."),
            item(site("Transfer a domain", "/app/marketplace/domains"), "Move a name you already own to us."),
            item(market("Domain endings", "/pricing#domains"), ".bw, .co.bw, .com, .africa, .co.za and more."),
          ],
        },
        {
          heading: "Included",
          links: [
            item(market("DNS management", "/pricing#domains"), "Records set up and changed for you."),
            item(market("Free security certificates", "/security"), "Every site on your domain served over HTTPS."),
          ],
        },
      ],
      feature: { kind: "domainSearch", heading: "Find your domain", text: "Search once and see every ending that is free." },
    },
    {
      label: "Email",
      right: false,
      columns: [
        {
          heading: "Email and documents",
          links: [
            item(market("Microsoft 365", "/pricing#cat-productivity"), "Email, Teams and Office, set up by us.", M365),
            item(market("Google Workspace", "/pricing#cat-productivity"), "Gmail, Meet and Docs on your own name.", GWS),
            item(market("Business email", "/pricing#cat-web"), "A simple mailbox on your own domain.", ["business-email"]),
          ],
        },
        {
          heading: "Looked after",
          links: [
            item(market("Move your existing email", "/quote"), "We move your mail across with nothing lost."),
            item(market("Cost calculator", "/tools/cost-calculator"), "Your team's plan and monthly total in a minute.", [...M365, ...GWS]),
            item(market("Email backup", "/pricing#cat-protection"), "Daily copies of every mailbox.", ["backup-microsoft-365", "backup-google-workspace"]),
          ],
        },
      ],
      feature: { kind: "partnerBadge" },
    },
    {
      label: "Websites",
      right: false,
      columns: [
        {
          heading: "Your website",
          links: [
            item(market("We build it for you", "/quote"), "Our designers build it and you approve every step."),
            item(market("WordPress hosting", "/pricing#cat-web"), "Fast, secured and backed up by us.", ["wordpress-hosting"]),
            item(market("Web hosting", "/pricing#cat-web"), "Hosting for the site you already have.", ["web-hosting"]),
          ],
        },
      ],
      feature: { kind: "websitePreview" },
    },
    {
      label: "Security",
      right: false,
      columns: [
        {
          heading: "Protection",
          links: [
            item(market("Security score", "/security"), "One score shows where you stand, and what to fix."),
            item(market("Device protection and EDR", "/pricing#cat-protection"), "Threats watched on every device, around the clock.", ["managed-detection-response"]),
            item(market("Data protection support", "/security"), "How we keep your data, and help you meet the Act."),
          ],
        },
        {
          heading: "Free checks",
          links: [
            item(market("Email security check", "/tools/email-security"), "See whether someone could send email as you."),
            item(market("Data protection checklist", "/tools/data-protection"), "Your readiness score and next steps."),
          ],
        },
      ],
      feature: {
        kind: "note",
        heading: "Free security check",
        text: "Enter your domain and see in a minute whether your email can be faked, and how to fix it.",
        link: { label: "Check your domain", to: "market", path: "/tools/email-security" },
      },
    },
    {
      label: "Hosting and backup",
      right: false,
      columns: [
        {
          heading: "Hosting",
          links: [
            item(market("Cloud servers", "/pricing#cat-servers"), "Managed servers, monitored and patched.", ["managed-vps-small", "managed-vps-medium", "managed-vps-large"]),
            item(market("Hosted applications", "/pricing#cat-web"), "Koha, Odoo and WordPress, run for you.", ["wordpress-hosting"]),
          ],
        },
        {
          heading: "Backup",
          links: [
            item(market("Backup", "/pricing#cat-protection"), "Daily backups of servers, email and files.", ["server-backup", "backup-microsoft-365", "backup-google-workspace"]),
            item(market("Disaster recovery", "/pricing#cat-protection"), "Get running again fast if a server fails.", ["disaster-recovery"]),
            item(market("Local data copy", "/pricing#cat-protection"), "A copy of your data kept in Botswana.", ["local-data-copy"]),
          ],
        },
      ],
      feature: { kind: "note", heading: "Backups we test", text: "We restore a test copy every month, so you know your backup works before you need it." },
    },
    {
      label: "Expense management",
      right: false,
      columns: [
        {
          heading: "Thebe",
          links: [
            item(thebe("Requests from anywhere"), "Staff raise requests from their phone."),
            item(thebe("Approval workflows"), "Routed by team, amount and budget."),
            item(thebe("Live budgets"), "What is spent, committed and left."),
            item(thebe("Ask Thebe"), "Ask in plain words what you spent."),
            item(thebe("Audit trail"), "Every request and approval recorded."),
          ],
        },
      ],
      feature: { kind: "thebe", heading: "Every request approved properly", text: "Expense and purchase management for whole organisations." },
    },
    {
      label: "Support",
      right: true,
      columns: [
        {
          heading: "Get help",
          links: [
            item(market("Help centre", "/help"), "Answers to common questions."),
            item(market("Insights", "/insights"), "Practical advice on security, backup and running your business online."),
            item({ link: { label: "Contact us", to: "email", subject: "Question" } }, "Email our support team."),
            item(market("Service status", "/status"), "Whether everything is working normally."),
          ],
        },
      ],
      feature: { kind: "support", heading: "Talk to our team" },
    },
  ],
  links: [item(market("Plans", "/#plans"), "", ["plan-start", "plan-grow", "plan-protect"])],
} satisfies Omit<Header, "id" | "updatedAt" | "createdAt" | "_status">;

export const DEFAULT_FOOTER = {
  newsletter: { heading: "Insights in your inbox, once a month.", text: "Practical advice on security, backup and running your business online. No spam, unsubscribe any time." },
  tagline: "Everything your business needs online. Handled.\nLooking after businesses since 2014.",
  columns: [
    {
      heading: "What we look after",
      links: [
        market("Domains", "/#domains"),
        market("Email and Microsoft 365", "/#email"),
        market("Websites and stores", "/#websites"),
        market("Security", "/#security"),
        market("Cloud hosting and backup", "/#services"),
        market("Expense management", "/#thebe"),
      ],
    },
    { heading: "Company", links: [market("Pricing", "/pricing"), market("Insights", "/insights"), market("Free tools", "/tools"), market("Ask for a quote", "/quote")] },
    { heading: "Trust", links: [market("Service status", "/status"), market("Security", "/security"), market("Service providers", "/legal/service-providers"), market("Legal", "/legal/terms")] },
    {
      heading: "Support",
      links: [market("Help centre", "/help"), { link: { label: "Contact us", to: "email", subject: "Question" } as Link }, { link: { label: "Report a security issue", to: "email", subject: "Security issue" } as Link }, market("Refunds and cancellations", "/legal/refunds"), site("Sign in", "/sign-in")],
    },
  ],
  contact: { address: "Plot 27860, Block 3, Gaborone" },
} satisfies Omit<Footer, "id" | "updatedAt" | "createdAt" | "_status">;
