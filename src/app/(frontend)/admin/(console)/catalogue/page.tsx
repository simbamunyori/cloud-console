import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment, todayIn } from "@/lib/dates";
import { priceDay } from "@/lib/domain/pricing";
import { requireStaffCan } from "@/server/admin/context";
import { catalogueChanges, catalogueTree, CONNECTOR_LABEL, FULFILMENT_LABEL } from "@/server/admin/catalogue";
import { prisma } from "@/server/db";
import { StatusBadge } from "./parts";

export const metadata: Metadata = { title: "Catalogue" };

export default async function CataloguePage() {
  await requireStaffCan("manageCatalogue");
  const month = priceDay(todayIn(DEFAULT_TIME_ZONE));
  const [{ families, markets }, changes] = await Promise.all([catalogueTree(prisma, month), catalogueChanges(prisma)]);
  const marketName = new Map(markets.map((m) => [m.code, m.code.toUpperCase()]));

  return (
    <>
      <PageHeader
        title="Catalogue"
        description="Families, categories and products. Draft is hidden everywhere, internal shows to staff and our test organisations, live is on sale. Prices are approved on the Pricing page."
        actions={
          <>
            <Button asChild>
              <Link href="/admin/catalogue/products/new">
                <Plus aria-hidden /> Add product
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/admin/catalogue/categories/new">Add category</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/admin/catalogue/families/new">Add family</Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {families.map((f) => (
          <Card key={f.key} aria-labelledby={`family-${f.key}`}>
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
              <span className="flex min-w-0 flex-1 flex-col">
                <h2 id={`family-${f.key}`} className="text-headline text-ink">
                  {f.name}
                </h2>
                <span className="text-callout text-ink-muted">Fulfilled by {CONNECTOR_LABEL[f.connector]}</span>
              </span>
              <StatusBadge status={f.status} />
              <Link href={`/admin/catalogue/families/${f.key}`} className="text-callout font-semibold text-link hover:underline">
                Edit<span className="sr-only"> {f.name}</span>
              </Link>
            </div>
            {f.categories.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">No categories yet.</p>
              </CardBody>
            ) : (
              f.categories.map((c) => (
                <section key={c.key} aria-labelledby={`category-${c.key}`} className="border-b border-border last:border-0">
                  <div className="flex items-center gap-3 bg-surface-0 px-5 py-2 sm:px-6">
                    <h3 id={`category-${c.key}`} className="flex-1 text-callout font-semibold text-ink-muted">
                      {c.name}
                    </h3>
                    <Link href={`/admin/catalogue/categories/${c.key}`} className="text-callout text-link hover:underline">
                      Edit<span className="sr-only"> {c.name}</span>
                    </Link>
                  </div>
                  {c.products.length === 0 ? (
                    <p className="px-5 py-3 text-callout text-ink-muted sm:px-6">No products yet.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {c.products.map((p) => (
                        <li key={p.slug}>
                          <Link href={`/admin/catalogue/products/${p.slug}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="font-semibold text-ink">{p.name}</span>
                              <span className="text-callout text-ink-muted">
                                {FULFILMENT_LABEL[p.fulfilment]} · {p.markets.length ? p.markets.map((m) => marketName.get(m) ?? m).join(", ") : "No markets"}
                              </span>
                            </span>
                            <span className="flex flex-wrap justify-end gap-2">
                              {p.fulfilment !== "QUOTE" && p.unpriced.length ? <Badge tone="warning">No price in {p.unpriced.map((m) => m.toUpperCase()).join(", ")}</Badge> : null}
                              {p.billingProductId ? null : <Badge tone="info">Not in billing yet</Badge>}
                              <StatusBadge status={p.shown} />
                            </span>
                            <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))
            )}
          </Card>
        ))}
        <Card aria-labelledby="changes-title">
          <CardHeader id="changes-title" title="Recent changes" description="Everything is also in the staff audit log, with the fields before and after." />
          {changes.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No changes yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {changes.map((c) => (
                <li key={c.id} className="flex flex-col px-5 py-3 sm:px-6">
                  <span className="text-ink">{c.summary}</span>
                  <span className="text-callout text-ink-muted">
                    {c.actorLabel}, {formatMoment(c.createdAt, DEFAULT_TIME_ZONE)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
