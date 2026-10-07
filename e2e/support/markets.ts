import { PrismaClient } from "@prisma/client";
import { DEMO_CUSTOMER } from "./sessions";

/**
 * The phone-width review (STRATEGY_ROLLOUT U11) opens every console screen
 * as a customer in each of the three markets. Botswana is the seeded demo
 * customer; South Africa and Zimbabwe get a small organisation of their
 * own, made once, so their prices, currency and dates show in their own
 * formats. Development and CI databases only.
 */
export const REVIEW_MARKETS = ["bw", "za", "zw"] as const;
export type ReviewMarket = (typeof REVIEW_MARKETS)[number];

const SETTINGS: Record<Exclude<ReviewMarket, "bw">, { name: string; country: string; currency: string; timeZone: string; locale: string; city: string }> = {
  za: { name: "Rosebank Freight (phone check)", country: "ZA", currency: "ZAR", timeZone: "Africa/Johannesburg", locale: "en-ZA", city: "Johannesburg" },
  zw: { name: "Avondale Traders (phone check)", country: "ZW", currency: "USD", timeZone: "Africa/Harare", locale: "en-ZW", city: "Harare" },
};

/** The email to sign in as for a market's review. */
export async function reviewCustomer(market: ReviewMarket): Promise<string> {
  if (market === "bw") return DEMO_CUSTOMER;
  if (process.env.NODE_ENV === "production") throw new Error("Review customers are for development and CI only.");
  const s = SETTINGS[market];
  const email = `phone-check@${market}.example`;
  const db = new PrismaClient();
  try {
    const org = await db.organisation.upsert({
      where: { slug: `phone-check-${market}` },
      update: {},
      create: { slug: `phone-check-${market}`, name: s.name, country: s.country, billingMarket: market, currency: s.currency, timeZone: s.timeZone, locale: s.locale, addressLine1: "12 Main Road", city: s.city, internal: true },
    });
    const user = await db.user.upsert({ where: { email }, update: {}, create: { email, name: "Thandi Ndlovu", passwordHash: "x", emailVerifiedAt: new Date(), totpEnabled: true } });
    await db.membership.upsert({ where: { organisationId_userId: { organisationId: org.id, userId: user.id } }, update: { active: true }, create: { organisationId: org.id, userId: user.id, role: "OWNER" } });
    return email;
  } finally {
    await db.$disconnect();
  }
}
