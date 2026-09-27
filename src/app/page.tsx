import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { HomeContent } from "@/components/site/home";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { HERO } from "@/config/site";
import { chooseMarket, defaultMarket, isCrawler, MARKET_COOKIE } from "@/lib/domain/markets";
import { requestCountry } from "@/server/markets/geo";
import { enabledMarkets, serviceCards, siteMetadata, taxNote } from "@/server/site/site";

export async function generateMetadata(): Promise<Metadata> {
  const m = defaultMarket(await enabledMarkets());
  const meta = await siteMetadata(m.code, "", { title: `Managed cloud for business | ${company.name}`, description: HERO.sub });
  // "/" is the x-default; each market's page is its own canonical.
  return { ...meta, alternates: { ...meta.alternates, canonical: "/" } };
}

/**
 * "/" sends each visitor to their market: the one they chose before (the
 * cookie), else the one for their country, else the default market.
 * Crawlers are never redirected: they get the default market's home page
 * here, with hreflang links to every market.
 */
export default async function Root() {
  const markets = await enabledMarkets();
  if (isCrawler((await headers()).get("user-agent"))) {
    const m = defaultMarket(markets);
    return (
      <SitePage code={m.code} path="">
        <HomeContent market={m} services={await serviceCards(m.code)} taxNote={taxNote(m)} />
      </SitePage>
    );
  }
  const cookie = (await cookies()).get(MARKET_COOKIE)?.value;
  const { market } = chooseMarket(markets, { cookie, country: cookie ? undefined : await requestCountry() });
  redirect(`/${market.code}`);
}
