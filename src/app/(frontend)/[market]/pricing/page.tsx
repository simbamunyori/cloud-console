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
      <div className="mx-auto max-w-content px-4 py-12 sm:px-6 lg:py-16">
        {intro ? (
          <PageHeading block={intro} market={m} />
        ) : (
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="label-kicker text-link">Pricing</p>
            <h1 className="text-title-1 text-ink sm:text-display">One invoice a month, in your currency.</h1>
            <p className="text-body text-ink-muted">
              Prices for {m.name}, per month unless it says otherwise. They are fixed for the month and every line on your invoice is explained.{note ? ` ${note}` : ""}
            </p>
          </div>
        )}

        <div className="mt-10 flex flex-col gap-10">
          {categories.map(({ category, products }) => (
            <section key={category.key} aria-labelledby={`cat-${category.key}`} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 id={`cat-${category.key}`} className="text-title-2 text-ink">
                  {category.name}
                </h2>
                <p className="text-callout text-ink-muted">{category.description}</p>
              </div>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-1">
                {products.map(({ product, price }) => (
                  <li key={product.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
                    <div className="flex flex-col gap-0.5">
                      <h3 className="text-headline text-ink">{product.name}</h3>
                      <p className="text-callout text-ink-muted">{product.summary}</p>
                    </div>
                    <p className="shrink-0 text-callout text-ink sm:text-right">
                      <span className="text-headline tabular-nums">{formatMoney(price, m.locale)}</span> {product.unitLabel} a month
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {domains.length ? (
            <section aria-labelledby="domains-title" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 id="domains-title" className="text-title-2 text-ink">
                  Domain names
                </h2>
                <p className="text-callout text-ink-muted">A year at a time, renewed on your monthly invoice.</p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border bg-surface-1">
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
                <a href={`mailto:${m.supportEmail}?subject=${encodeURIComponent("Book a call")}`}>Book a call</a>
              </Button>
            </div>
          </div>
        )}
      </div>
      {rest.length ? <RenderBlocks blocks={rest} market={m} /> : null}
    </SitePage>
  );
}
