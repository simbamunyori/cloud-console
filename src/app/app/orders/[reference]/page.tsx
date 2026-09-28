import { ArrowLeft, CircleCheck, Clock, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { OrderStatusBadge } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { money } from "@/lib/domain/money";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { requireMember } from "@/server/org/context";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ reference }, { new: isNew }] = await Promise.all([params, searchParams]);
  const { db, organisation, locale } = await requireMember();
  const order = await db.order.findFirst({ where: { reference }, include: { product: true } });
  if (!order) notFound();
  const options = (order.options ?? {}) as Record<string, string>;
  const isDomain = order.product.slug === DOMAIN_PRODUCT_SLUG;
  const title = isDomain ? options.Domain : order.product.name;
  const tz = organisation.timeZone;

  return (
    <>
      <Link href="/app/services" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Services
      </Link>
      <PageHeader eyebrow={`Order ${order.reference}`} title={title} actions={<OrderStatusBadge status={order.status} />} />
      <div className="flex flex-col gap-6">
        {isNew ? <Alert tone="positive">Thanks, your order is in. We&apos;ve emailed you a copy.</Alert> : null}
        <Card>
          <CardBody className="flex items-start gap-4">
            {order.status === "ACTIVE" ? <CircleCheck aria-hidden className="mt-1 size-6 shrink-0 text-positive" /> : <Clock aria-hidden className="mt-1 size-6 shrink-0 text-link" />}
            <div className="flex flex-col gap-1">
              <p className="text-headline text-ink">
                {order.status === "SETTING_UP" ? `Expected by ${formatMoment(order.expectedBy, tz)}` : order.status === "ACTIVE" ? "Ready to use" : order.status === "CANCELLED" ? "Cancelled" : "Couldn't be set up"}
              </p>
              <p className="text-ink-muted">
                {order.status === "SETTING_UP"
                  ? "Our team is setting this up. We'll email you when it's ready, or if we need anything from you."
                  : order.status === "ACTIVE"
                    ? "Everything is set up."
                    : "Contact support if you have any questions about this order."}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card aria-labelledby="order-details">
          <CardHeader id="order-details" title="Order details" />
          <CardBody>
            <DetailList
              items={[
                ["Placed", formatMoment(order.createdAt, tz)],
                ...(order.quantity > 1 || order.changesServiceId ? ([["Quantity", String(order.quantity)]] as [string, string][]) : []),
                ...Object.entries(options).map(([k, v]) => [k, v] as [string, string]),
                isDomain
                  ? ["Price", <Amount locale={locale} key="p" value={money(order.unitPriceMinor, order.currency)} />]
                  : ["Price a month", <Amount locale={locale} key="p" value={money(order.monthlyTotalMinor, order.currency)} />],
              ]}
            />
          </CardBody>
        </Card>
        {order.billingInvoiceId ? (
          <Button asChild variant="secondary" className="self-start">
            <Link href={`/app/billing/invoices/${order.billingInvoiceId}`}>
              <ReceiptText aria-hidden /> View the invoice
            </Link>
          </Button>
        ) : null}
      </div>
    </>
  );
}
