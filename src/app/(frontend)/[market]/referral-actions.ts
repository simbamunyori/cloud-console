"use server";

import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { activePartnerByCode, REFERRAL_COOKIE, REFERRAL_DAYS } from "@/server/referrals/referrals";
import { cookieDomain } from "@/server/site/urls";

/** A visit through a referral partner's link (?ref=code, U9): remembered in this browser for sign-up. */
export async function referralVisitAction(code: string) {
  const partner = await activePartnerByCode(prisma, String(code ?? ""));
  if (!partner?.code) return;
  const jar = await cookies();
  // Shared with the console's host, where sign-up reads it.
  const domain = cookieDomain();
  const name = process.env.NODE_ENV === "production" && !domain ? `__Host-${REFERRAL_COOKIE}` : REFERRAL_COOKIE;
  jar.set(name, partner.code, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: REFERRAL_DAYS * 24 * 60 * 60, domain });
}
