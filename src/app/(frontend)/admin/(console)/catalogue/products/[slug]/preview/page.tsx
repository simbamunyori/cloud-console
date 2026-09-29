import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard, ProductDetails } from "@/components/app/product-view";
import { Alert } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { todayIn } from "@/lib/dates";
import { monthOf } from "@/lib/domain/pricing";
import { requireStaffCan } from "@/server/admin/context";
import { nextMonth } from "@/server/admin/pricing";
import { anyProductBySlug } from "@/server/catalogue/catalogue";
import { approvedPrice, productItem } from "@/server/catalogue/price-book";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { effectiveStatus } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Product preview" };

/**
 * A product as a customer in one market would see it, whatever its status:
 * its marketplace card and page, at the price approved for this month (or
 * next month's, when that is all there is yet).
 */
export default async function ProductPreviewPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ market?: string }> }) {
  await requireStaffCan("manageCatalogue");
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const product = slug === DOMAIN_PRODUCT_SLUG ? null : await anyProductBySlug(prisma, slug);
  if (!product) notFound();
  const markets = await prisma.market.findMany({ orderBy: { sortOrder: "asc" } });
  const market = markets.find((m) => m.code === query.market) ?? markets.find((m) => product.markets.includes(m.code)) ?? markets[0];
  const month = monthOf(todayIn(market.timeZone));
  const price = (await approvedPrice(prisma, market, productItem(product.slug), month)) ?? (await approvedPrice(prisma, market, productItem(product.slug), nextMonth(month)));
  const shown = effectiveStatus(product, product.category.family);

  return (
    <>
      <Link href={`/admin/catalogue/products/${product.slug}`} className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {product.name}
      </Link>
      <div className="mb-6 flex flex-col gap-3">
        <Alert tone={shown === "LIVE" ? "positive" : "info"}>
          Preview for customers in {market.name}. {shown === "LIVE" ? "This is on sale." : `It is ${shown === "DRAFT" ? "a draft" : "internal"}, so customers don't see it yet.`}
          {product.markets.includes(market.code) ? "" : ` It isn't offered in ${market.name}.`}
          {product.fulfilment !== "QUOTE" && !price ? ` There is no approved price in ${market.name} yet.` : ""}
        </Alert>
        <nav aria-label="Preview market" className="flex flex-wrap gap-2">
          {markets.map((m) => (
            <Link
              key={m.code}
              href={`?market=${m.code}`}
              aria-current={m.code === market.code ? "page" : undefined}
              className="rounded-md border border-border px-3 py-1.5 text-callout text-ink hover:bg-surface-2 aria-[current=page]:border-brand aria-[current=page]:bg-brand-soft aria-[current=page]:text-link"
            >
              {m.name}
            </Link>
          ))}
        </nav>
      </div>

      <section aria-labelledby="card-title" className="mb-10 flex flex-col gap-3">
        <h2 id="card-title" className="text-headline text-ink">
          Card in the marketplace
        </h2>
        <div className="max-w-sm">
          <ProductCard product={product} price={product.fulfilment === "QUOTE" ? null : price} locale={market.locale} />
        </div>
      </section>

      <section aria-labelledby="page-title" className="flex flex-col gap-3 rounded-lg border border-dashed border-border-strong p-4 sm:p-6">
        <h2 id="page-title" className="text-headline text-ink">
          Its page
        </h2>
        <PageHeader eyebrow={product.category.name} title={product.name} description={product.summary} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
          <ProductDetails product={product} />
          <Card aria-label="Order">
            <CardBody className="flex flex-col gap-3">
              {product.fulfilment === "QUOTE" ? (
                <p className="text-ink-muted">Customers ask for a quote here instead of ordering.</p>
              ) : price ? (
                <p className="text-callout text-ink-muted">
                  <Amount locale={market.locale} value={price} size="title-1" className="text-ink" /> {product.unitLabel} a month
                </p>
              ) : (
                <p className="text-ink-muted">No approved price yet.</p>
              )}
              <p className="text-callout text-ink-muted">The order form appears here for customers.</p>
            </CardBody>
          </Card>
        </div>
      </section>
    </>
  );
}
