import { ArrowLeft, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RegisterDomainForm } from "@/app/(frontend)/app/marketplace/domains/register-form";
import { RemoveButton } from "@/app/(frontend)/[market]/cart/remove-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { toJson } from "@/lib/domain/money";
import { monthOf } from "@/lib/domain/pricing";
import { requireBilling } from "@/server/billing/context";
import { hasLegalText, REFUNDS_CONSENT_SECTION } from "@/server/cms/legal";
import { can } from "@/server/org/access";
import { searchDomains, type DomainResult } from "@/server/orders/orders";
import { readCart } from "@/server/site/cart";

export const metadata: Metadata = { title: "Your cart" };

/** The domains picked on the public site, to register one by one with the customer's own prices. */
export default async function CartPage() {
  const { billing, db, actor, market, locale, today } = await requireBilling();
  const [names, owned] = await Promise.all([readCart(), billing.listDomains()]);
  const mine = new Set(owned.map((d) => d.name));
  const month = monthOf(today);
  const rows: { name: string; result: DomainResult | null }[] =
    await Promise.all(
      names.map(async (name) => ({
        name,
        result: mine.has(name)
          ? null
          : ((
              await searchDomains(db, billing, market, name, month).catch(
                () => [],
              )
            ).find((r) => r.name === name) ?? null),
      })),
    );
  const canOrder = can(actor, "order");
  const refunds = canOrder ? await hasLegalText(market.code, "refunds") : null;

  return (
    <>
      <Link
        href="/app/marketplace/domains"
        className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> Find a domain
      </Link>
      <PageHeader
        title="Your cart"
        description="The domains you picked on our website. Register each one here; it goes on your next invoice."
      />
      {!canOrder && rows.length ? (
        <Alert tone="info">
          Only owners and admins can register domains. Ask one of them to do it.
        </Alert>
      ) : null}
      <Card aria-label="Cart">
        {rows.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Your cart is empty">
            <Link
              href="/app/marketplace/domains"
              className="text-link underline underline-offset-2"
            >
              Search for a domain
            </Link>{" "}
            to add one.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(({ name, result: r }) => (
              <li
                key={name}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-headline break-all text-ink">
                    {name}
                  </span>
                  <RemoveButton name={name} />
                </span>
                {mine.has(name) ? (
                  <Badge tone="positive">Registered, see your services</Badge>
                ) : !r || !r.supported || !r.price ? (
                  <Badge>We can&apos;t check this name right now</Badge>
                ) : !r.available ? (
                  <Badge tone="negative">Taken</Badge>
                ) : canOrder ? (
                  <RegisterDomainForm
                    domain={r.name}
                    price={toJson(r.price)}
                    locale={locale}
                    refundsHref={
                      refunds
                        ? `/${market.code}/legal/refunds#${REFUNDS_CONSENT_SECTION}`
                        : null
                    }
                  />
                ) : (
                  <Badge tone="positive">Available</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
