import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductDetails } from "@/components/app/product-view";
import { Alert } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { toJson } from "@/lib/domain/money";
import { monthOf } from "@/lib/domain/pricing";
import { requireBilling } from "@/server/billing/context";
import { productBySlug, productOptions } from "@/server/catalogue/catalogue";
import { productPrice } from "@/server/catalogue/price-book";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { audienceFor } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";
import { hasLegalText, REFUNDS_CONSENT_SECTION } from "@/server/cms/legal";
import { can } from "@/server/org/access";
import { MAX_QUANTITY } from "@/server/orders/orders";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { actor, today, market, locale, organisation } = await requireBilling();
  const audience = audienceFor(organisation);
  const product = await productBySlug(prisma, slug, audience);
  if (!product || product.slug === DOMAIN_PRODUCT_SLUG) notFound();
  const price = await productPrice(prisma, product, market, monthOf(today), audience);
  const refunds = await hasLegalText(market.code, "refunds");
  // Not offered in this account's market.
  if (!price) notFound();

  return (
    <>
      <Link href="/app/marketplace" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Marketplace
      </Link>
      <PageHeader eyebrow={product.category.name} title={product.name} description={product.summary} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <ProductDetails product={product} />

        <Card aria-label="Order">
          <CardBody className="flex flex-col gap-5">
            {price ? (
              <p className="text-callout text-ink-muted">
                <Amount locale={locale} value={price} size="title-1" className="text-ink" /> {product.unitLabel} a month
              </p>
            ) : null}
            {!price ? (
              <p className="text-ink-muted">This can&apos;t be ordered online yet. Contact support and we&apos;ll set it up for you.</p>
            ) : can(actor, "order") ? (
              <OrderForm
                slug={product.slug}
                unitPrice={toJson(price)}
                locale={locale}
                unitLabel={product.unitLabel}
                quantityAllowed={product.quantityAllowed}
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
