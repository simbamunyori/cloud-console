import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductDetails } from "@/components/app/product-view";
import { featureOn } from "@/server/features/features";
import { Alert } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { toJson } from "@/lib/domain/money";
import { priceDay } from "@/lib/domain/pricing";
import { requireBilling } from "@/server/billing/context";
import { productBySlug, productOptions } from "@/server/catalogue/catalogue";
import { offeredIn, productPrice } from "@/server/catalogue/price-book";
import { shownInclusionsBySlug, withIncluded } from "@/server/catalogue/inclusions";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { audienceFor } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";
import { hasLegalText, REFUNDS_CONSENT_SECTION } from "@/server/cms/legal";
import { can } from "@/server/org/access";
import { MAX_QUANTITY } from "@/server/orders/orders";
import { OrderForm } from "./order-form";
import { InterestForm } from "../../security/managed/forms";
import { MANAGED_SECURITY_PRODUCTS, managedSecurityOn } from "@/server/soc/soc";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ quantity?: string }> }) {
  const { slug } = await params;
  // A free tool's estimate arrives with its number of people (Milestone 8).
  const asked = Number((await searchParams).quantity);
  const { actor, today, market, locale, organisation } = await requireBilling();
  const audience = audienceFor(organisation);
  const product = await productBySlug(prisma, slug, audience);
  if (!product || product.slug === DOMAIN_PRODUCT_SLUG) notFound();
  const byQuote = product.fulfilment === "QUOTE";
  const price = byQuote ? null : await productPrice(prisma, product, market, priceDay(today), audience);
  const refunds = await hasLegalText(market.code, "refunds");
  // Not offered in this account's market.
  if (byQuote ? !offeredIn(product, market.code, audience) : !price) notFound();

  // STRATEGY_ROLLOUT U5: managed security is sold once Admin > Features > Managed security is on; until then, interest is a pre-sales lead.
  const interestOnly = MANAGED_SECURITY_PRODUCTS.includes(product.slug) && !(await managedSecurityOn(prisma));
  const [botswanaData, included] = await Promise.all([featureOn(prisma, "botswana-data-claim"), shownInclusionsBySlug(prisma, [product.slug])]);
  return (
    <>
      <Link href="/app/marketplace" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Marketplace
      </Link>
      <PageHeader eyebrow={product.category.name} title={product.name} description={product.summary} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <ProductDetails product={{ ...product, includes: withIncluded(product.includes, included.get(product.slug) ?? []) }} botswanaData={botswanaData} />

        <Card aria-label="Order">
          <CardBody className="flex flex-col gap-5">
            {price ? (
              <p className="text-callout text-ink-muted">
                <Amount locale={locale} value={price} size="title-1" className="text-ink" /> {product.unitLabel} a month
              </p>
            ) : null}
            {byQuote ? (
              <>
                <p className="text-headline text-ink">Priced by quote</p>
                <p className="text-callout text-ink-muted">Every setup is different, so we price this for you. Tell us what you need and we&apos;ll email a quote you can accept here.</p>
                <Button asChild size="lg">
                  <Link href={`/app/quotes/new?product=${product.slug}`}>Ask for a quote</Link>
                </Button>
              </>
            ) : !price ? (
              <p className="text-ink-muted">This can&apos;t be ordered online yet. Contact support and we&apos;ll set it up for you.</p>
            ) : can(actor, "order") && interestOnly ? (
              <>
                <p className="text-callout text-ink-muted">Tell us about your computers and a security specialist will set it up with you.</p>
                <InterestForm />
              </>
            ) : can(actor, "order") ? (
              <OrderForm
                slug={product.slug}
                unitPrice={toJson(price)}
                locale={locale}
                unitLabel={product.unitLabel}
                quantityAllowed={product.quantityAllowed}
                initialQuantity={Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_QUANTITY) : undefined}
                minQuantity={product.minQuantity}
                maxQuantity={MAX_QUANTITY}
                options={productOptions(product)}
                refundsHref={refunds ? `/${market.code}/legal/refunds#${REFUNDS_CONSENT_SECTION}` : null}
              />
            ) : (
              <Alert tone="info">Only owners and admins can order. Ask one of them to order this for you.</Alert>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
