import "server-only";
import type { Market } from "@prisma/client";
import type { LegalKind } from "@/config/site";
import { legalPage } from "@/server/site/cms";

/** Market.legalPages keys, by page. */
const SETTING: Record<LegalKind, string> = { privacy: "privacy", terms: "terms", refunds: "refunds", "service-providers": "serviceProviders", "data-protection": "dataProtection" };

/** A lawyer-approved document's address from the market's settings, if staff have added one. */
export function approvedDocument(legalPages: unknown, kind: LegalKind): string | null {
  const v = legalPages && typeof legalPages === "object" ? (legalPages as Record<string, unknown>)[SETTING[kind]] : null;
  return typeof v === "string" && /^https:\/\//.test(v) ? v : null;
}

/**
 * Whether a market has something to show for a legal page: its own text
 * from the website editor, or a linked document. Pages with neither are
 * hidden (Milestone 10: nothing empty reaches the public site).
 */
export async function hasLegalPage(m: Pick<Market, "code" | "legalPages">, kind: LegalKind): Promise<boolean> {
  return Boolean(approvedDocument(m.legalPages, kind) || (await legalPage(m.code, kind)));
}
