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
import { referralOf } from "@/server/quotes/quotes";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { siteMarket, siteMetadata } from "@/server/site/site";
import { requestQuoteAction } from "./actions";

type Props = { params: Promise<{ market: string }>; searchParams: Promise<{ product?: string; for?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  const referral = referralOf((await searchParams).for);
  if (referral) return siteMetadata(m.code, "/quote", { title: `${referral.heading} | ${company.name}`, description: referral.intro });
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
  const asked = await searchParams;
  const slug = asked.product;
  // Work a partner carries out (final build, Milestone 9): same form, the partner's words.
  const referral = referralOf(asked.for);
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
          {referral ? (
            <div className="flex flex-col gap-3">
              <p className="label-kicker text-link">With {referral.partner}</p>
              <h1 className="text-title-1 text-ink sm:text-display">{referral.heading}</h1>
              <p className="text-body text-ink-muted">{referral.intro}</p>
            </div>
          ) : intro ? (
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
            hidden={{ market: m.code, ...(product ? { product: product.slug } : {}), ...(referral ? { referral: asked.for! } : {}) }}
            product={referral ? referral.topic : product?.name}
            after={referral ? `${referral.partner} will contact you about it.` : "We'll email you the quote. To accept it you'll sign in, or open an account if you don't have one."}
            notice={referral?.notice}
            button={referral ? "Send my request" : undefined}
          />
        </div>
        {referral ? (
          <aside aria-labelledby="quote-panel" className="flex flex-col gap-4 self-start rounded-lg bg-surface-2 p-6">
            <h2 id="quote-panel" className="text-headline text-ink">How it works</h2>
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-callout text-ink-body">
              <li>We read your request and pass it to {referral.partner}.</li>
              <li>{referral.partner} contacts you to understand the project and agree the work.</li>
              <li>For the cloud services we look after, such as compliance archiving, we stay your provider.</li>
            </ol>
          </aside>
        ) : panel ? (
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
