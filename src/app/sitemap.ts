import type { MetadataRoute } from "next";
import { FOOTER_LEGAL } from "@/config/site";
import { env } from "@/server/env";
import { hreflang, enabledMarkets } from "@/server/site/site";

// Data protection is on the Security page, so it has no entry of its own.
const PATHS = ["", "/pricing", "/security", ...FOOTER_LEGAL.map((k) => `/legal/${k}`)];

// Read per request: markets are switched on in the admin console, and APP_URL is only known at run time.
export const dynamic = "force-dynamic";

/** Every public page in every market that is switched on, with its alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL.replace(/\/$/, "");
  const markets = await enabledMarkets();
  return markets.flatMap((m) =>
    PATHS.map((path) => ({
      url: `${base}/${m.code}${path}`,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.6,
      alternates: { languages: Object.fromEntries(markets.map((o) => [hreflang(o), `${base}/${o.code}${path}`])) },
    })),
  );
}
