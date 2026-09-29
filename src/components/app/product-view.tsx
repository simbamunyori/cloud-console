import { Check, Clock, X } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody } from "@/components/ui/card";
import type { Money } from "@/lib/domain/money";

/**
 * A product as customers see it in the marketplace: its card in the grid
 * and the details on its own page. Staff previews use the same parts.
 */

interface ProductText {
  slug: string;
  name: string;
  summary: string;
  unitLabel: string;
}

export function ProductCard({ product, price, locale, href }: { product: ProductText; price: Money | null; locale: string; href?: string }) {
  const body = (
    <>
      <span className="text-headline text-ink">{product.name}</span>
      <span className="flex-1 text-callout text-ink-muted">{product.summary}</span>
      <span className="text-callout text-ink-muted">
        {price ? (
          <>
            <Amount locale={locale} value={price} size="headline" className="text-ink" /> {product.unitLabel} a month
          </>
        ) : (
          "Priced by quote"
        )}
      </span>
    </>
  );
  const className = "flex h-full flex-col gap-3 rounded-lg border border-border bg-surface-1 p-5 shadow-elevation-1";
  return href ? (
    <Link href={href} className={`${className} transition-shadow hover:shadow-elevation-2`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function setupTime(hours: number) {
  if (hours <= 8) return `Usually ready within ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.ceil(hours / 8);
  return `Usually ready within ${days} working ${days === 1 ? "day" : "days"}`;
}

export function ProductDetails({
  product,
}: {
  product: { includes: string[]; excludes: string[]; setupHours: number; minTermMonths: number; commitmentNote: string | null };
}) {
  return (
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
      {product.commitmentNote || product.minTermMonths > 1 ? (
        <Alert tone="info">
          <span className="font-semibold">Terms. </span>
          {product.minTermMonths > 1 ? `A minimum term of ${product.minTermMonths} months. ` : ""}
          {product.commitmentNote}
        </Alert>
      ) : null}
    </div>
  );
}
