import { HERO } from "@/config/site";
import { company } from "@/config/app";
import { cmsPage } from "@/server/site/cms";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { serviceCards, siteMarket, siteMetadata, taxNote } from "@/server/site/site";
import { RenderBlocks } from "./blocks";
import { HomeContent } from "./home";
import { SitePage } from "./site-page";

/** A market's home page metadata: the editor's home page, or the built-in one's. */
export async function marketHomeMetadata(code: string) {
  const m = await siteMarket(code);
  const fallback = { title: `Managed cloud for business | ${company.name}, ${m.name}`, description: HERO.sub };
  const page = await cmsPage(m.code, "home");
  return page ? cmsMetadata(m.code, "", page, fallback) : siteMetadata(m.code, "", fallback);
}

/** A market's home page: from the website editor once it has one, otherwise the built-in page. */
export async function MarketHome({ code }: { code: string }) {
  const m = await siteMarket(code);
  const page = await cmsPage(m.code, "home");
  return (
    <SitePage code={m.code} path="">
      {page ? <RenderBlocks blocks={page.layout} market={m} /> : <HomeContent market={m} services={await serviceCards(m.code)} taxNote={taxNote(m)} />}
    </SitePage>
  );
}
