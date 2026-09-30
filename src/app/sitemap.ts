import type { MetadataRoute } from "next";
import { FOOTER_LEGAL } from "@/config/site";
import { env } from "@/server/env";
import { hreflang, enabledMarkets, productPageSlugs } from "@/server/site/site";

// Data protection is on the Security page, so it has no entry of its own.
const PATHS = ["", "/pricing", "/security", "/insights", ...FOOTER_LEGAL.map((k) => `/legal/${k}`)];

// Read per request: markets are switched on in the admin console, and APP_URL is only known at run time.
export const dynamic = "force-dynamic";

/** Every public page in every market that is switched on, with its alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL.replace(/\/$/, "");
  const markets = await enabledMarkets();
  const products = await Promise.all(markets.map((m) => productPageSlugs(m.code)));
  const pages = markets.flatMap((m) =>
    PATHS.map((path) => ({
      url: `${base}/${m.code}${path}`,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.6,
      alternates: { languages: Object.fromEntries(markets.map((o) => [hreflang(o), `${base}/${o.code}${path}`])) },
    })),
  );
  // A product page exists only where the product is on sale, so its alternates are those markets.
  const productPages = markets.flatMap((m, i) =>
    products[i].map((slug) => ({
      url: `${base}/${m.code}/products/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      alternates: { languages: Object.fromEntries(markets.flatMap((o, j) => (products[j].includes(slug) ? [[hreflang(o), `${base}/${o.code}/products/${slug}`]] : []))) },
    })),
  );
  return [...pages, ...productPages];
}
