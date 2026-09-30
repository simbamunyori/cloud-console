import type { Metadata } from "next";
import { PageHeading, RenderBlocks } from "@/components/site/blocks";
import { fill, SiteRichText } from "@/components/site/rich-text";
import { SitePage } from "@/components/site/site-page";
import { QuoteRequestForm } from "@/components/quotes/request-form";
import { company } from "@/config/app";
import { countryOptions } from "@/lib/countries";
import { prisma } from "@/server/db";
import { requestCountry } from "@/server/markets/geo";
import { cmsPage } from "@/server/site/cms";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { siteMarket, siteMetadata } from "@/server/site/site";
import { requestQuoteAction } from "./actions";

type Props = { params: Promise<{ market: string }>; searchParams: Promise<{ product?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  const fallback = {
    title: `Ask for a quote | ${company.name}`,
    description: `Tell us what you need and we'll email you a quote in ${m.currency}. You don't need an account to ask.`,
  };
  const page = await cmsPage(m.code, "quote");
  return page ? cmsMetadata(m.code, "/quote", page, fallback) : siteMetadata(m.code, "/quote", fallback);
}

type Layout = NonNullable<NonNullable<Awaited<ReturnType<typeof cmsPage>>>["layout"]>;
type Of<T extends Layout[number]["blockType"]> = Extract<Layout[number], { blockType: T }>;
const first = <T extends Layout[number]["blockType"]>(layout: Layout, type: T) => layout.find((b): b is Of<T> => b.blockType === type);

/**
 * Anyone can ask, signed in or not. An account is only needed to accept.
 * The heading and the panel beside the form are the editor's "quote" page
 * (its Page heading and first Text section); any other sections follow.
 */
export default async function QuotePage({ params, searchParams }: Props) {
  const m = await siteMarket((await params).market);
  const slug = (await searchParams).product;
  const product = slug
    ? await prisma.product.findFirst({ where: { slug, status: "LIVE", markets: { has: m.code }, category: { family: { status: "LIVE" } } }, select: { slug: true, name: true } })
    : null;
  const [detected, page] = await Promise.all([requestCountry(), cmsPage(m.code, "quote")]);
  const layout = page?.layout ?? [];
  const intro = first(layout, "pageIntro");
  const panel = first(layout, "text");
  const rest = layout.filter((b) => b !== intro && b !== panel);
  return (
    <SitePage code={m.code} path="/quote">
      <div className="page-container grid gap-10 py-12 lg:grid-cols-[1fr_var(--layout-aside-wide)] lg:py-16">
        <div className="flex max-w-2xl flex-col gap-8">
          {intro ? (
            <PageHeading block={intro} market={m} />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="label-kicker text-link">Quotes</p>
              <h1 className="text-title-1 text-ink sm:text-display">Tell us what you need.</h1>
              <p className="text-body text-ink-muted">We&apos;ll look at it and email you a quote in {m.currency}. You don&apos;t need an account to ask.</p>
            </div>
          )}
          <QuoteRequestForm
            action={requestQuoteAction}
            countries={countryOptions()}
            defaults={{ country: detected ?? m.countries[0] ?? "" }}
            hidden={{ market: m.code, ...(product ? { product: product.slug } : {}) }}
            product={product?.name}
            after="We'll email you the quote. To accept it you'll sign in, or open an account if you don't have one."
          />
        </div>
        {panel ? (
          <aside aria-labelledby="quote-panel" className="flex flex-col gap-4 self-start rounded-lg bg-surface-2 p-6">
            {panel.heading ? (
              <h2 id="quote-panel" className="text-headline text-ink">
                {fill(panel.heading, m)}
              </h2>
            ) : null}
            <SiteRichText data={panel.body} market={m} style="prose" />
          </aside>
        ) : page ? null : (
          <aside aria-labelledby="quote-panel" className="flex flex-col gap-4 self-start rounded-lg bg-surface-2 p-6">
            <h2 id="quote-panel" className="text-headline text-ink">How it works</h2>
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-callout text-ink-body">
              <li>We read your request and call you if anything needs clearing up.</li>
              <li>We email you a quote with a price for each part, monthly or once, and the date it holds until.</li>
              <li>You accept it in the console, and it becomes an order at the quoted price.</li>
            </ol>
          </aside>
        )}
      </div>
      {rest.length ? <RenderBlocks blocks={rest} market={m} /> : null}
    </SitePage>
  );
}
