import config from "@payload-config";
import { getPayload } from "payload";
import type { LegalKindValue } from "@/cms/collections/legal";
import { isMarketLocale } from "@/cms/locales";

/** The refunds policy section a customer is pointed to when agreeing that a service starts now. */
export const REFUNDS_CONSENT_SECTION = "seven-day-cooling-off-for-consumers";

/** Whether a market has published text of its own for a legal page (another market's never counts). */
export async function hasLegalText(market: string, kind: LegalKindValue): Promise<boolean> {
  if (!isMarketLocale(market)) return false;
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "legal",
    where: { and: [{ kind: { equals: kind } }, { _status: { equals: "published" } }] },
    locale: market,
    fallbackLocale: false,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    select: { title: true },
  });
  return Boolean(docs[0]?.title);
}
