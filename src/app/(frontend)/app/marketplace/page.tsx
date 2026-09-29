import { PackageOpen, Search } from "lucide-react";
import type { Metadata } from "next";
import { ProductCard } from "@/components/app/product-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { withDataCentre } from "@/config/site";
import { monthOf } from "@/lib/domain/pricing";
import { requireBilling } from "@/server/billing/context";
import { marketplace } from "@/server/catalogue/price-book";
import { audienceFor } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Marketplace" };

export default async function MarketplacePage() {
  const { today, market, locale, organisation } = await requireBilling();
  const categories = await marketplace(prisma, market, monthOf(today), audienceFor(organisation));

  return (
    <>
      <PageHeader title="Marketplace" description="Everything we offer, with the monthly price you'll pay. Prices are fixed for the month and go on your one monthly invoice." />
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
