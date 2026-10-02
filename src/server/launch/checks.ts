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

export async function launchChecks(db: PrismaClient): Promise<{ placeholders: string[]; checks: LaunchCheck[] }> {
  const e = env();
  const placeholders = await findPlaceholders(db, placeholderEnv());
  const checks: LaunchCheck[] = [
    {
      key: "site-url",
      label: "The website has its own address",
      done: Boolean(e.SITE_URL),
      detail: e.SITE_URL ? `${e.SITE_URL}, with the console at ${e.APP_URL}.` : "Set SITE_URL to https://fourthgeneration.technology once DNS points at this server (docs/launch.md).",
    },
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
