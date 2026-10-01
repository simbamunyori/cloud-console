import { Check, ChevronDown, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SitePage } from "@/components/site/site-page";
import { Button } from "@/components/ui/button";
import { company } from "@/config/app";
import { formatMoney } from "@/lib/domain/money";
import { partnerLinks } from "@/server/site/partner-links";
import { productPage, siteMarket, siteMetadata, taxNote } from "@/server/site/site";

type Props = { params: Promise<{ market: string; slug: string }> };

async function load({ params }: Props) {
  const { market, slug } = await params;
  await siteMarket(market);
  const page = await productPage(market, slug);
  if (!page) notFound();
  return page;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { m, product } = await load(props);
  const path = `/products/${product.slug}`;
  const meta = await siteMetadata(m.code, path, { title: `${product.name} | ${company.name}`, description: product.summary });
  // A product is on sale only in some markets: its alternates are the market it is read in.
  const image = { url: `/api/share/${product.slug}`, width: 1200, height: 627, alt: product.name };
  return { ...meta, alternates: { canonical: `/${m.code}${path}` }, openGraph: { ...meta.openGraph, images: [image] }, twitter: { card: "summary_large_image", images: [image.url] } };
}

const months = (n: number) => (n === 1 ? "1 month" : `${n} months`);

/**
 * A product's own page (docs/FINAL_BUILD.md, Milestone 7): the catalogue's
 * words and price, who it is for and the questions a Publisher approved.
 */
export default async function ProductPage(props: Props) {
  const { m, product: p, price, audience, faq } = await load(props);
  const { bookingHref } = await partnerLinks(m.code);
  const note = taxNote(m);
  const quote = p.fulfilment === "QUOTE";
  const order = `/sign-in?next=${encodeURIComponent(`/app/marketplace/${p.slug}`)}`;
  return (
    <SitePage code={m.code} path={`/products/${p.slug}`}>
      <div className="page-container flex flex-col gap-12 py-12 lg:gap-16 lg:py-16">
        <nav aria-label="Breadcrumb" className="text-callout text-ink-muted">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href={`/${m.code}/pricing`} className="hover:text-ink hover:underline">
                Pricing
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li>
              <Link href={`/${m.code}/pricing#cat-${p.category.key}`} className="hover:text-ink hover:underline">
                {p.category.name}
              </Link>
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
          <div className="flex min-w-0 flex-1 flex-col gap-10">
            <header className="flex max-w-3xl flex-col gap-4">
              <p className="label-kicker text-link">{p.category.name}</p>
              <h1 className="text-title-1 text-ink sm:text-display xl:text-display-lg">{p.name}</h1>
              <p className="text-body text-ink-muted xl:text-headline xl:font-normal">{p.summary}</p>
            </header>

            {audience ? (
              <section aria-labelledby="for-title" className="flex max-w-3xl flex-col gap-3">
                <h2 id="for-title" className="text-title-2 text-ink">
                  Who it is for
                </h2>
                <p className="text-body text-ink">{audience}</p>
              </section>
            ) : null}

            {p.includes.length || p.excludes.length ? (
              <div className="grid gap-8 sm:grid-cols-2">
                {p.includes.length ? (
                  <section aria-labelledby="includes-title" className="flex flex-col gap-3">
                    <h2 id="includes-title" className="text-title-2 text-ink">
                      What is included
                    </h2>
                    <ul className="flex flex-col gap-2.5">
                      {p.includes.map((line) => (
                        <li key={line} className="flex gap-3 text-body text-ink">
                          <Check aria-hidden className="mt-1 size-4 shrink-0 text-positive" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {p.excludes.length ? (
                  <section aria-labelledby="excludes-title" className="flex flex-col gap-3">
                    <h2 id="excludes-title" className="text-title-2 text-ink">
                      Not included
                    </h2>
                    <ul className="flex flex-col gap-2.5">
                      {p.excludes.map((line) => (
                        <li key={line} className="flex gap-3 text-body text-ink-muted">
                          <Minus aria-hidden className="mt-1 size-4 shrink-0" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside aria-labelledby="price-title" className="flex h-fit shrink-0 flex-col gap-5 rounded-lg border border-border bg-surface-1 p-6 lg:sticky lg:top-24 lg:w-96 xl:w-112 xl:p-8">
            <h2 id="price-title" className="text-headline text-ink">
              {quote ? "Priced for what you run" : "Price"}
            </h2>
            {price ? (
              <p className="flex flex-col text-callout text-ink-muted">
                <span className="text-display text-ink tabular-nums">{formatMoney(price, m.locale)}</span>
                {p.unitLabel} a month
              </p>
            ) : (
              <p className="text-body text-ink-muted">Tell us what you need and we send you a written quote.</p>
            )}
            <dl className="flex flex-col gap-2 border-t border-border pt-4 text-callout">
              {p.minTermMonths > 1 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Minimum term</dt>
                  <dd className="text-ink">{months(p.minTermMonths)}</dd>
                </div>
              ) : (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Term</dt>
                  <dd className="text-ink">Month to month</dd>
                </div>
              )}
              {p.quantityAllowed && p.minQuantity > 1 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-muted">Smallest order</dt>
                  <dd className="text-ink">{p.minQuantity}</dd>
                </div>
              ) : null}
            </dl>
            {p.commitmentNote ? <p className="text-callout text-ink-muted">{p.commitmentNote}</p> : null}
            {price && note ? <p className="text-caption text-ink-muted">{note}</p> : null}
            <div className="flex flex-col gap-3">
              {quote ? (
                <Button asChild size="lg">
                  <Link href={`/${m.code}/quote?product=${p.slug}`}>Ask for a quote</Link>
                </Button>
              ) : (
                <Button asChild size="lg">
                  <Link href={order}>Order now</Link>
                </Button>
              )}
              {quote ? null : (
                <Button asChild variant="secondary" size="lg">
                  <Link href={`/${m.code}/quote?product=${p.slug}`}>Talk to us first</Link>
                </Button>
              )}
              {bookingHref ? (
                <Link href={`${bookingHref}?topic=product&about=${encodeURIComponent(p.slug)}`} className="text-center text-callout font-semibold text-link hover:underline">
                  Book a call with a pre-sales engineer
                </Link>
              ) : null}
            </div>
          </aside>
        </div>

        {faq.length ? (
          <section aria-labelledby="faq-title" className="flex max-w-3xl flex-col gap-5">
            <h2 id="faq-title" className="text-title-2 text-ink xl:text-title-1">
              Questions
            </h2>
            <div className="flex flex-col divide-y divide-border border-y border-border">
              {faq.map((f) => (
                <details key={f.question} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-headline text-ink [&::-webkit-details-marker]:hidden">
                    {f.question}
                    <ChevronDown aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-body text-ink-muted">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </SitePage>
  );
}
