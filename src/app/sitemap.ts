import type { MetadataRoute } from "next";
import { LEGAL_PAGES } from "@/config/site";
import { env } from "@/server/env";
import { hreflang, enabledMarkets } from "@/server/site/site";

const PATHS = ["", "/pricing", "/security", ...Object.keys(LEGAL_PAGES).map((k) => `/legal/${k}`)];

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
