import type { Metadata } from "next";
import { RenderBlocks } from "@/components/site/blocks";
import { HomeContent } from "@/components/site/home";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { HERO } from "@/config/site";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { cmsPage } from "@/server/site/cms";
import { serviceCards, siteMarket, siteMetadata, taxNote } from "@/server/site/site";

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market } = await params;
  const m = await siteMarket(market);
  const fallback = { title: `Managed cloud for business | ${company.name}, ${m.name}`, description: HERO.sub };
  const page = await cmsPage(m.code, "home");
  return page ? cmsMetadata(m.code, "", page, fallback) : siteMetadata(m.code, "", fallback);
}

/** The market's home page: from the website editor once it has one, otherwise the built-in page. */
export default async function MarketHome({ params }: Props) {
  const { market } = await params;
  const m = await siteMarket(market);
  const page = await cmsPage(m.code, "home");
  return (
    <SitePage code={m.code} path="">
      {page ? <RenderBlocks blocks={page.layout} market={m} /> : <HomeContent market={m} services={await serviceCards(m.code)} taxNote={taxNote(m)} />}
    </SitePage>
  );
}
