import "server-only";
import type { PrismaClient } from "@prisma/client";
import { FOOTER_LEGAL, LEGAL_PAGES, type LegalKind } from "@/config/site";
import { env } from "@/server/env";
import { findPlaceholders } from "@/server/placeholders";
import { secret } from "@/server/secrets";
import { legalPage } from "@/server/site/cms";
import { approvedDocument } from "@/server/site/legal";

/**
 * What still stands between the console and customers (Milestone 10). The
 * same placeholders the server refuses to start with in production, plus
 * the things only staff can finish: legal text, the site's own address,
 * off-site backups and the staff console's address allowlist.
 */

export interface LaunchCheck {
  key: string;
  label: string;
  done: boolean;
  /** What to do, or what is in place. */
  detail: string;
  /** Where staff fix it, when it is in the console. */
  href?: string;
}

/** The environment the startup check reads, as src/instrumentation.ts gives it. */
export function placeholderEnv() {
  const e = env();
  return {
    ...e,
    SMTP_URL: e.SMTP_URL ?? null,
    WHMCS_API_IDENTIFIER_SET: Boolean(secret("WHMCS_API_IDENTIFIER")),
    WHMCS_API_SECRET_SET: Boolean(secret("WHMCS_API_SECRET")),
    SALES_ASSISTANT_DEMO: process.env.SALES_ASSISTANT_DEMO,
    TOOLS_DEMO: process.env.TOOLS_DEMO,
  };
}

const LEGAL_KINDS: LegalKind[] = [...FOOTER_LEGAL, "data-protection"];

/**
 * The website's address. It is www: the bare domain stays on the mail and
 * web server, which redirects to www, so a SITE_URL without www would send
 * visitors to a host this server never answers for.
 */
export function siteUrlCheck(siteUrl: string | undefined, appUrl: string): LaunchCheck {
  const check = { key: "site-url", label: "The website opens on its www address" };
  if (!siteUrl) return { ...check, done: false, detail: "Point the www record at this server, then run deploy/site-setup.sh, which sets SITE_URL to https://www.fourthgeneration.technology (docs/launch.md)." };
  if (!new URL(siteUrl).hostname.startsWith("www.")) {
    return { ...check, done: false, detail: `SITE_URL is ${siteUrl}, but the bare domain stays on the mail and web server. Run deploy/site-setup.sh again to set it to the www address.` };
  }
  return { ...check, done: true, detail: `${siteUrl}, with sign-in and the consoles at ${appUrl}.` };
}

export async function launchChecks(db: PrismaClient): Promise<{ placeholders: string[]; checks: LaunchCheck[] }> {
  const e = env();
  const placeholders = await findPlaceholders(db, placeholderEnv());
  const checks: LaunchCheck[] = [
    siteUrlCheck(e.SITE_URL, e.APP_URL),
    {
      key: "offsite",
      label: "Nightly backups are copied off the server",
      done: Boolean(e.OFFSITE_S3_BUCKET),
      detail: e.OFFSITE_S3_BUCKET ? `Copied to ${e.OFFSITE_S3_BUCKET}.` : "Add Contabo Object Storage (the OFFSITE_S3_ settings) before real customer data goes in.",
    },
    {
      key: "allowlist",
      label: "The staff console only opens from our addresses",
      done: Boolean(e.ADMIN_IP_ALLOWLIST.trim()),
      detail: e.ADMIN_IP_ALLOWLIST.trim() ? "ADMIN_IP_ALLOWLIST is set." : "Optional. Set ADMIN_IP_ALLOWLIST to the office and VPN addresses so nobody else can reach /admin.",
    },
    {
      key: "exchange-rates",
      label: "Exchange rates come from Bank of Botswana",
      done: Boolean(secret("ALLRATESTODAY_API_KEY")),
      detail: secret("ALLRATESTODAY_API_KEY") ? "Fetched daily; new prices are built every 14 days (docs/exchange-rates.md)." : "Set ALLRATESTODAY_API_KEY on the server (docs/exchange-rates.md). Until then rates are typed at /admin/pricing.",
      href: "/admin/pricing",
    },
  ];
  for (const m of await db.market.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } })) {
    for (const kind of LEGAL_KINDS) {
      const doc = await legalPage(m.code, kind);
      const document = approvedDocument(m.legalPages, kind);
      const approved = Boolean(document || doc?.approvedByLegal);
      checks.push({
        key: `legal-${m.code}-${kind}`,
        label: `${m.name}: ${LEGAL_PAGES[kind]}`,
        done: approved,
        detail: document ? "Linked to the approved document." : doc ? (approved ? "Approved by legal and published." : "Published as a draft for legal review: it shows the draft notice until a Publisher ticks Approved by legal.") : "No text yet, so the page is hidden. Add it in the website editor, Legal pages.",
        href: "/admin/content/collections/legal",
      });
    }
  }
  return { placeholders, checks };
}
