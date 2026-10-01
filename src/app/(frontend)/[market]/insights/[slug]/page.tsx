import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { insightPath } from "@/cms/collections/insights";
import { MediaImage } from "@/components/site/blocks/parts";
import { insightMeta } from "@/components/site/insights";
import { SiteRichText } from "@/components/site/rich-text";
import { SitePage } from "@/components/site/site-page";
import { Button } from "@/components/ui/button";
import { company } from "@/config/app";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import { insightBySlug } from "@/server/site/cms";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { relatedProduct, siteMarket } from "@/server/site/site";

type Props = { params: Promise<{ market: string; slug: string }> };

async function load({ params }: Props) {
  const { market, slug } = await params;
  const m = await siteMarket(market);
  const insight = await insightBySlug(m.code, slug);
  if (!insight) notFound();
  return { m, insight };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { m, insight } = await load(props);
  const meta = await cmsMetadata(m.code, insightPath(insight.slug), { seo: { ...insight.seo, image: insight.image } }, { title: `${insight.title} | ${company.name}`, description: insight.summary });
  return { ...meta, openGraph: { ...meta.openGraph, type: "article" } };
}

/** One insight, ending with its related product. */
export default async function InsightPage(props: Props) {
  const { m, insight: i } = await load(props);
  const product = await relatedProduct(m.code, i.related);
  return (
    <SitePage code={m.code} path={insightPath(i.slug)}>
      <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 lg:py-16">
        <header className="flex flex-col gap-3">
          <p className="label-kicker text-link">{insightMeta(i)}</p>
          <h1 className="text-title-1 text-ink sm:text-display">{i.title}</h1>
          <p className="text-body text-ink-muted xl:text-headline xl:font-normal">{i.summary}</p>
          {i.publishedAt ? <p className="text-caption text-ink-muted"><time dateTime={i.publishedAt}>{formatDay(new Date(i.publishedAt), true)}</time></p> : null}
        </header>
        {i.image && typeof i.image === "object" ? <MediaImage media={i.image} priority sizes="(min-width: 768px) 720px, calc(100vw - 32px)" className="w-full rounded-lg border border-border" /> : null}
        <SiteRichText data={i.body} market={m} style="prose" />
        {product ? (
          <aside aria-labelledby="related-title" className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-6 sm:p-8">
            <p className="label-kicker text-link">Related</p>
            <h2 id="related-title" className="text-title-2 text-ink">
              {product.name}
            </h2>
            <p className="text-callout text-ink-muted">{product.summary}</p>
            <p className="text-callout text-ink">
              From <span className="font-semibold tabular-nums">{formatMoney(product.price, m.locale)}</span> {product.unitLabel} a month
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={product.href}>See prices</Link>
              </Button>
            </div>
          </aside>
        ) : null}
      </article>
    </SitePage>
  );
}
