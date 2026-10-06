import { ArrowRight, PackageOpen, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { ProductCard } from "@/components/app/product-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { withDataCentre } from "@/config/site";
import { priceDay } from "@/lib/domain/pricing";
import { requireBilling } from "@/server/billing/context";
import { marketplace } from "@/server/catalogue/price-book";
import { audienceFor } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";

export const metadata: Metadata = { title: "Marketplace" };

export default async function MarketplacePage() {
  const { today, market, locale, organisation } = await requireBilling();
  const [categories, recommender] = await Promise.all([marketplace(prisma, market, priceDay(today), audienceFor(organisation)), featureOn(prisma, "plan-recommender")]);

  return (
    <>
      <PageHeader title="Marketplace" description="Everything we offer, with the monthly price you'll pay. Prices are fixed for 14 days at a time and go on your one monthly invoice." />
      <div className="flex flex-col gap-10">
        <form action="/app/marketplace/domains" method="get" className="flex flex-col gap-3 rounded-lg bg-navy p-5 text-on-navy sm:flex-row sm:items-end sm:p-6" role="search">
          <label className="flex flex-1 flex-col gap-2">
            <span className="text-headline">Find a domain name</span>
            <input
              name="q"
              placeholder={`yourcompany${market.highlightedTlds[0] ?? ".com"}`}
              autoCapitalize="none"
              spellCheck={false}
              className="h-12 rounded-md border border-transparent bg-surface-1 px-4 text-body text-ink placeholder:text-ink-muted"
            />
          </label>
          <Button type="submit" size="lg">
            <Search aria-hidden /> Search
          </Button>
        </form>

        {recommender && categories.some((c) => c.category.key === "productivity") ? (
          <Link href="/app/marketplace/recommend" className="group flex items-center gap-4 rounded-lg border border-border bg-surface-1 p-5 hover:bg-surface-2 sm:p-6">
            <Sparkles aria-hidden className="size-6 shrink-0 text-link" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-headline text-ink">Not sure which Microsoft 365 or Google Workspace plan?</span>
              <span className="text-callout text-ink-muted">Answer two questions and we&apos;ll show the plan that fits, at your prices.</span>
            </span>
            <ArrowRight aria-hidden className="size-5 shrink-0 text-link transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : null}

        {categories.length ? null : (
          <EmptyState icon={PackageOpen} title="Nothing to order here yet">
            We&apos;re still setting prices for your country. Contact support and we&apos;ll quote you directly.
          </EmptyState>
        )}

        {categories.map(({ category, products }) => (
          <section key={category.key} aria-labelledby={`cat-${category.key}`} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id={`cat-${category.key}`} className="text-title-2 text-ink">
                {category.name}
              </h2>
              <p className="text-ink-muted">{category.key === "servers" ? withDataCentre(category.description, market) : category.description}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map(({ product, price }) => (
                <li key={product.id}>
                  <ProductCard product={product} price={price} locale={locale} href={`/app/marketplace/${product.slug}`} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
