import { ArrowLeft, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { toJson } from "@/lib/domain/money";
import { requireBilling } from "@/server/billing/context";
import { monthOf } from "@/lib/domain/pricing";
import { legalDocument, REFUNDS_CONSENT_SECTION } from "@/server/site/legal";
import { can, DomainError } from "@/server/org/access";
import { searchDomains, type DomainResult } from "@/server/orders/orders";
import { RegisterDomainForm } from "./register-form";

export const metadata: Metadata = { title: "Find a domain" };

export default async function DomainsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const { billing, db, actor, market, locale, today } = await requireBilling();
  let results: DomainResult[] = [];
  let error: string | null = null;
  if (q.trim()) {
    try {
      results = await searchDomains(db, billing, market, q, monthOf(today));
    } catch (e) {
      if (e instanceof DomainError) error = e.message;
      else throw e;
    }
  }
  const canOrder = can(actor, "order");
  const refunds = canOrder ? await legalDocument(market.code, "refunds") : null;

  return (
    <>
      <Link href="/app/marketplace" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Marketplace
      </Link>
      <PageHeader
        title="Find a domain"
        description={`Search for a name, or try ${market.highlightedTlds.join(", ")}. Renewals go on your monthly invoice each year.`}
      />
      <div className="flex flex-col gap-6">
        <form method="get" role="search" className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="q" className="sr-only">
            Domain name
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="yourcompany.co.bw"
            autoCapitalize="none"
            spellCheck={false}
            className="h-12 w-full rounded-md border border-border-strong bg-surface-1 px-4 sm:flex-1 text-body text-ink placeholder:text-ink-muted"
          />
          <Button type="submit" size="lg">
            <Search aria-hidden /> Search
          </Button>
        </form>
        {error ? <Alert>{error}</Alert> : null}
        {!canOrder && results.length ? <Alert tone="info">Only owners and admins can register domains. Ask one of them to do it.</Alert> : null}
        {results.length ? (
          <Card aria-label="Results">
            <ul className="divide-y divide-border">
              {results.map((r) => (
                <li key={r.name} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <span className="flex flex-col gap-1">
                    <span className="text-headline text-ink break-all">{r.name}</span>
                    {r.supported && r.price ? (
                      <span className="text-callout text-ink-muted">
                        <Amount locale={locale} value={r.price} className="text-callout" /> a year
                      </span>
                    ) : null}
                  </span>
                  {!r.supported ? (
                    <Badge className="self-start">Not sold here yet</Badge>
                  ) : !r.available ? (
                    <Badge tone="negative" className="self-start">Taken</Badge>
                  ) : canOrder && r.price ? (
                    <RegisterDomainForm domain={r.name} price={toJson(r.price)} locale={locale} refundsHref={refunds ? `/${market.code}/legal/refunds#${REFUNDS_CONSENT_SECTION}` : null} />
                  ) : (
                    <Badge tone="positive">Available</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
