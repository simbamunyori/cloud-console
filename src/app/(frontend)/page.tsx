import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MarketHome, marketHomeMetadata } from "@/components/site/market-home";
import { chooseMarket, defaultMarket, isCrawler, MARKET_COOKIE } from "@/lib/domain/markets";
import { requestCountry } from "@/server/markets/geo";
import { enabledMarkets } from "@/server/site/site";

export async function generateMetadata(): Promise<Metadata> {
  const m = defaultMarket(await enabledMarkets());
  const meta = await marketHomeMetadata(m.code);
  // "/" is the x-default; each market's page is its own canonical.
  return { ...meta, alternates: { ...meta.alternates, canonical: "/" } };
}

/**
 * "/" sends each visitor to their market: the one they chose before (the
 * cookie), else the one for their country, else the default market.
 * Crawlers are never redirected: they get the default market's home page
 * here (the editor's, as at /<market>), with hreflang links to every market.
 */
export default async function Root() {
  const markets = await enabledMarkets();
  if (isCrawler((await headers()).get("user-agent"))) {
    return <MarketHome code={defaultMarket(markets).code} />;
  }
  const cookie = (await cookies()).get(MARKET_COOKIE)?.value;
  const { market } = chooseMarket(markets, { cookie, country: cookie ? undefined : await requestCountry() });
  redirect(`/${market.code}`);
}
