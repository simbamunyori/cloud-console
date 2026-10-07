import { HERO } from "@/config/site";
import { company } from "@/config/app";
import { cmsPage } from "@/server/site/cms";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { serviceCards, siteMarket, siteMetadata, taxNote } from "@/server/site/site";
import { RenderBlocks } from "./blocks";
import { HomeContent } from "./home";
import { SitePage } from "./site-page";

/** A market's home page metadata: the editor's home page, or the built-in one's. Its description starts with the hero's supporting line. */
export async function marketHomeMetadata(code: string) {
  const m = await siteMarket(code);
  const page = await cmsPage(m.code, "home");
  // The supporting line opens the description (STRATEGY_ROLLOUT U2), unless the editor wrote one under Search and sharing.
  const hero = page?.layout?.find((b) => b.blockType === "homeHero");
  const description = hero ? [hero.supporting, hero.sub].filter(Boolean).join(" ") : `${HERO.supportingLine} ${HERO.sub}`;
  const fallback = { title: `Managed cloud for business | ${company.name}, ${m.name}`, description: description || HERO.sub };
  return page ? cmsMetadata(m.code, "", page, fallback) : siteMetadata(m.code, "", fallback);
}

/** A market's home page: from the website editor once it has one, otherwise the built-in page. */
export async function MarketHome({ code, domain }: { code: string; domain?: string }) {
  const m = await siteMarket(code);
  const page = await cmsPage(m.code, "home");
  return (
    <SitePage code={m.code} path="">
      {page ? <RenderBlocks blocks={page.layout} market={m} domain={domain} /> : <HomeContent market={m} services={await serviceCards(m.code)} taxNote={taxNote(m)} />}
    </SitePage>
  );
}
