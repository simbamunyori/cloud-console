import "server-only";
import { hostPlan, sharedCookieDomain } from "@/lib/net/hosts";
import { env } from "@/server/env";

/** The public website's address: SITE_URL once the site has its own host, else the console's. No trailing slash. */
export function siteUrl(): string {
  const e = env();
  return (e.SITE_URL ?? e.APP_URL).replace(/\/$/, "");
}

/** The parent domain for cookies the site sets and the console reads, or undefined for host-only cookies. */
export function cookieDomain(): string | undefined {
  const e = env();
  return sharedCookieDomain(hostPlan(e.SITE_URL, e.APP_URL)) ?? undefined;
}
