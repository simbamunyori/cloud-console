import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading, RenderBlocks } from "@/components/site/blocks";
import { CmsButton } from "@/components/site/blocks/parts";
import { fill } from "@/components/site/rich-text";
import { SitePage } from "@/components/site/site-page";
import { Button } from "@/components/ui/button";
import { company } from "@/config/app";
import { formatMoney } from "@/lib/domain/money";
import { cmsPage } from "@/server/site/cms";
import { cmsMetadata } from "@/server/site/cms-metadata";
import { pricingTables, siteMarket, siteMetadata, taxNote } from "@/server/site/site";

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  const fallback = {
    title: `Pricing in ${m.name} | ${company.name}`,
    description: `Monthly prices in ${m.currency} for Microsoft 365, Google Workspace, servers, hosting, security and domain names, on one invoice.`,
  };
  const page = await cmsPage(m.code, "pricing");
  return page ? cmsMetadata(m.code, "/pricing", page, fallback) : siteMetadata(m.code, "/pricing", fallback);
}

/**
 * The market's prices, always live from its price book. The heading and
 * the panel under the tables come from the editor's "pricing" page (its
 * Page heading and first Call to action); any other sections follow.
 */
export default async function PricingPage({ params }: Props) {
  const m = await siteMarket((await params).market);
  const [{ categories, domains }, page] = await Promise.all([pricingTables(m.code), cmsPage(m.code, "pricing")]);
  const note = taxNote(m);
  const layout = page?.layout ?? [];
  const intro = layout.find((b) => b.blockType === "pageIntro");
  const panel = layout.find((b) => b.blockType === "callToAction");
  const rest = layout.filter((b) => b !== intro && b !== panel);
  return (
    <SitePage code={m.code} path="/pricing">
      <div className="page-container py-12 lg:py-16">
        {intro ? (
          <PageHeading block={intro} market={m} />
        ) : (
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="label-kicker text-link">Pricing</p>
            <h1 className="text-title-1 text-ink sm:text-display xl:text-display-lg">One invoice a month, in your currency.</h1>
            <p className="text-body text-ink-muted">
              Prices for {m.name}, per month unless it says otherwise. They are fixed for the month and every line on your invoice is explained.{note ? ` ${note}` : ""}
            </p>
          </div>
        )}

        <nav aria-label="Jump to a family" className="mt-8 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-2">
            {categories.map(({ category }) => (
              <li key={category.key}>
                <a href={`#cat-${category.key}`} className="inline-flex h-9 items-center whitespace-nowrap rounded-full border border-border bg-surface-0 px-4 text-callout font-semibold text-ink hover:border-border-strong hover:bg-surface-2">
                  {category.name}
                </a>
              </li>
            ))}
            {domains.length ? (
              <li>
                <a href="#domains-title" className="inline-flex h-9 items-center whitespace-nowrap rounded-full border border-border bg-surface-0 px-4 text-callout font-semibold text-ink hover:border-border-strong hover:bg-surface-2">
                  Domain names
                </a>
              </li>
            ) : null}
          </ul>
        </nav>

        <div className="mt-10 flex flex-col gap-12 xl:mt-12 xl:gap-16">
          {categories.map(({ category, products }) => (
            <section key={category.key} aria-labelledby={`cat-${category.key}`} className="flex scroll-mt-24 flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id={`cat-${category.key}`} className="scroll-mt-24 text-title-2 text-ink xl:text-title-1">
                  {category.name}
                </h2>
                <p className="text-callout text-ink-muted xl:text-body">{category.description}</p>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:gap-6 2xl:grid-cols-4">
                {products.map(({ product, price }) => (
                  <li key={product.id} className="flex flex-col gap-4 rounded-lg border border-border bg-surface-1 p-5 transition-shadow duration-fast hover:shadow-elevation-2 xl:p-6">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-headline text-ink">{product.name}</h3>
                      <p className="text-callout text-ink-muted">{product.summary}</p>
                    </div>
                    <div className="mt-auto flex flex-col gap-4 border-t border-border pt-4">
                      {price ? (
                        <p className="flex flex-col text-callout text-ink-muted">
                          <span className="text-title-2 text-ink tabular-nums">{formatMoney(price, m.locale)}</span>
                          {product.unitLabel} a month
                        </p>
                      ) : (
                        <p className="flex flex-col text-callout text-ink-muted">
                          <span className="text-title-2 text-ink">By quote</span>
                          Priced for what you run
                        </p>
                      )}
                      {price ? (
                        <Button asChild variant="secondary" className="w-full">
                          <Link href="/sign-up">Get started</Link>
                        </Button>
                      ) : (
                        <Button asChild variant="secondary" className="w-full">
                          <Link href={`/${m.code}/quote?product=${product.slug}`}>Ask for a quote</Link>
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {domains.length ? (
            <section aria-labelledby="domains-title" className="flex scroll-mt-24 flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="domains-title" className="scroll-mt-24 text-title-2 text-ink xl:text-title-1">
                  Domain names
                </h2>
                <p className="text-callout text-ink-muted">A year at a time, renewed on your monthly invoice.</p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border bg-surface-1 lg:max-w-3xl">
                <table className="w-full text-left text-callout">
                  <thead className="text-ink-muted">
                    <tr className="border-b border-border">
                      <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Ending</th>
                      <th scope="col" className="px-3 py-3 text-right font-semibold">First year</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">Renewal a year</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {domains.map((d) => (
                      <tr key={d.tld}>
                        <th scope="row" className="px-5 py-3 font-medium text-ink sm:px-6">{d.tld}</th>
                        <td className="px-3 py-3 text-right text-ink tabular-nums">{formatMoney(d.register, m.locale)}</td>
                        <td className="px-5 py-3 text-right text-ink tabular-nums sm:px-6">{formatMoney(d.renew, m.locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        {panel ? (
          <div className="mt-12 flex flex-col items-start gap-4 rounded-lg bg-navy p-6 text-ink-on-dark sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <p className="text-headline text-on-navy">{fill(panel.heading, m)}</p>
            <div className="flex flex-wrap gap-3">
              <CmsButton link={panel.primary} market={m} />
              <CmsButton link={panel.secondary} market={m} variant="secondary" />
            </div>
          </div>
        ) : page ? null : (
          <div className="mt-12 flex flex-col items-start gap-4 rounded-lg bg-navy p-6 text-ink-on-dark sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <p className="text-headline text-on-navy">Not sure what you need? Tell us what you run today.</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href={`/${m.code}/quote`}>Ask for a quote</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
      {rest.length ? <RenderBlocks blocks={rest} market={m} /> : null}
    </SitePage>
  );
}
