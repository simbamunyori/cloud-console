import type { Metadata } from "next";
import { HomeContent } from "@/components/site/home";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { HERO } from "@/config/site";
import { serviceCards, siteMarket, siteMetadata, taxNote } from "@/server/site/site";

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market } = await params;
  const m = await siteMarket(market);
  return siteMetadata(m.code, "", { title: `Managed cloud for business | ${company.name}, ${m.name}`, description: HERO.sub });
}

export default async function MarketHome({ params }: Props) {
  const { market } = await params;
  const m = await siteMarket(market);
  return (
    <SitePage code={m.code} path="">
      <HomeContent market={m} services={await serviceCards(m.code)} taxNote={taxNote(m)} />
    </SitePage>
  );
}
