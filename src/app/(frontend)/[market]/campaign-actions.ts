"use server";

import { cookies } from "next/headers";
import { requestContext } from "@/server/auth/next";
import { CAMPAIGN_COOKIE, CAMPAIGN_DAYS, encodeTouch, recordCampaign, touchFrom } from "@/server/campaigns/campaigns";
import { prisma } from "@/server/db";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { cookieDomain } from "@/server/site/urls";

/** A visit through a tracked link: remembers its tags in this browser and counts it. */
export async function campaignVisitAction(tags: { campaign?: string; source?: string; medium?: string }) {
  const touch = touchFrom(tags ?? {});
  if (!touch) return;
  const jar = await cookies();
  // With the site and console on their own hosts the cookie is shared with
  // the console, where sign-up counts it, so it can't be a __Host- cookie.
  const domain = cookieDomain();
  const name = process.env.NODE_ENV === "production" && !domain ? `__Host-${CAMPAIGN_COOKIE}` : CAMPAIGN_COOKIE;
  jar.set(name, encodeTouch(touch), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: CAMPAIGN_DAYS * 24 * 60 * 60, domain });
  try {
    await enforce(prisma, `campaignVisit:${(await requestContext()).ipAddress ?? "unknown"}`, LIMITS.campaignVisitPerIp);
    await recordCampaign(prisma, touch, "VISIT");
  } catch (e) {
    if (!(e instanceof RateLimitedError)) throw e;
  }
}
