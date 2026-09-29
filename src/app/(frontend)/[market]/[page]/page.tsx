import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RenderBlocks } from "@/components/site/blocks";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { cmsPage } from "@/server/site/cms";
import { siteMarket } from "@/server/site/site";

type Props = { params: Promise<{ market: string; page: string }> };

/** A page made in the website editor, at /<market>/<address>. */
async function load({ params }: Props) {
  const { market, page: slug } = await params;
  const m = await siteMarket(market);
  // "home" is the market's own address, never /<market>/home.
  const page = slug === "home" ? null : await cmsPage(m.code, slug);
  if (!page) notFound();
  return { m, page };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { m, page } = await load(props);
  return cmsMetadata(m.code, `/${page.slug}`, page, { title: `${page.title} | ${company.name}, ${m.name}`, description: "" });
}

export default async function CmsPage(props: Props) {
  const { m, page } = await load(props);
  return (
    <SitePage code={m.code} path={`/${page.slug}`}>
      <RenderBlocks blocks={page.layout} market={m} />
    </SitePage>
  );
}
