import type { MetadataRoute } from "next";
import { env } from "@/server/env";

// Read per request: markets are switched on in the admin console, and APP_URL is only known at run time.
export const dynamic = "force-dynamic";

/** The public site is for search engines; the consoles and the switcher aren't. */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/sign-in", "/sign-up", "/invite", "/setup-authenticator", "/switch-market", "/stub-gateway"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
