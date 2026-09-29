import { ArrowLeft, Check, Clock, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { prisma } from "@/server/db";
import { legalDocument, REFUNDS_CONSENT_SECTION } from "@/server/site/legal";
import { can } from "@/server/org/access";
import { MAX_QUANTITY } from "@/server/orders/orders";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "Product" };

function setupTime(hours: number) {
  if (hours <= 8) return `Usually ready within ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.ceil(hours / 8);
  return `Usually ready within ${days} working ${days === 1 ? "day" : "days"}`;
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { actor, today, market, locale } = await requireBilling();
  const product = await productBySlug(prisma, slug);
  if (!product || product.slug === DOMAIN_PRODUCT_SLUG) notFound();
  const price = await productPrice(prisma, product, market, monthOf(today));
  const refunds = await legalDocument(market.code, "refunds");
  // Not offered in this account's market.
  if (!price) notFound();

  return (
    <>
      <Link href="/app/marketplace" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Marketplace
      </Link>
      <PageHeader eyebrow={product.category.name} title={product.name} description={product.summary} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <div className="flex flex-col gap-6">
          <Card>
            <CardBody className="grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <h2 className="text-headline text-ink">What&apos;s included</h2>
                <ul className="flex flex-col gap-2">
                  {product.includes.map((i) => (
                    <li key={i} className="flex gap-2 text-ink-body">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
              {product.excludes.length ? (
                <div className="flex flex-col gap-3">
                  <h2 className="text-headline text-ink">Not included</h2>
                  <ul className="flex flex-col gap-2">
                    {product.excludes.map((i) => (
                      <li key={i} className="flex gap-2 text-ink-body">
                        <X aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                        {i}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>
          <p className="flex items-center gap-2 text-callout text-ink-muted">
            <Clock aria-hidden className="size-4" /> {setupTime(product.setupHours)}. We&apos;ll email you when it&apos;s ready.
          </p>
          {product.commitmentNote ? (
            <Alert tone="info">
              <span className="font-semibold">Terms. </span>
              {product.commitmentNote}
            </Alert>
          ) : null}
        </div>

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
