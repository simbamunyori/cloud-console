import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { CONNECTIVITY_FAMILY, connectivityLicences } from "@/server/connectivity/connectivity";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { STATUS_LABEL, effectiveStatus } from "@/server/catalogue/visibility";
import { LicenceForm } from "./forms";

export const metadata: Metadata = { title: "Connectivity" };

/**
 * STRATEGY_ROLLOUT U12: the licence per market, whether Connectivity is
 * switched on, the Connect products waiting in the catalogue and the
 * quote requests that have come in.
 */
export default async function ConnectivityPage() {
  await requireStaffCan("manageCompany");
  const [markets, on, products, requests] = await Promise.all([
    connectivityLicences(prisma),
    featureOn(prisma, "connectivity"),
    prisma.product.findMany({ where: { category: { familyKey: CONNECTIVITY_FAMILY } }, include: { category: { include: { family: true } } }, orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }] }),
    prisma.connectivityRequest.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { quote: { select: { reference: true, company: true, name: true, market: true, status: true } } } }),
  ]);
  return (
    <>
      <PageHeader
        title="Connectivity"
        description="Nothing here reaches visitors or customers until the licence for a market is recorded and Connectivity is switched on in Features. Even then, it is offered only in markets with a licence."
        actions={on ? <Badge tone="positive">On in Features</Badge> : <Badge>Off in Features</Badge>}
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="licences-title">
          <CardHeader id="licences-title" title="Licences" description="Record each market's licence once it is granted. Removing the last one switches Connectivity off." />
          <ul className="divide-y divide-border">
            {markets.map((m) => (
              <li key={m.code} className="flex flex-col gap-4 px-5 py-5 sm:px-6">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {m.name}
                  {m.licence ? <Badge tone="positive">Licensed since {formatDay(m.licence.grantedOn, true)}</Badge> : <Badge>No licence</Badge>}
                  {m.enabled ? null : <Badge>Market off</Badge>}
                </p>
                <LicenceForm market={m.code} current={m.licence ? { regulator: m.licence.regulator, reference: m.licence.reference, grantedOn: m.licence.grantedOn.toISOString().slice(0, 10) } : null} />
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="products-title">
          <CardHeader
            id="products-title"
            title="Connect products and bundles"
            description="Sold by quote. Finish their words in the catalogue; they can be made internal to try them, and live once Connectivity is on."
            action={
              <Link href={`/admin/catalogue/families/${CONNECTIVITY_FAMILY}`} className="text-callout text-link hover:underline">
                Open in the catalogue
              </Link>
            }
          />
          <ul className="divide-y divide-border">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/catalogue/products/${p.slug}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold text-ink">{p.name}</span>
                    <span className="text-callout text-ink-muted">{p.category.name}</span>
                  </span>
                  <Badge>{STATUS_LABEL[effectiveStatus(p, p.category.family)]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card aria-labelledby="requests-title">
          <CardHeader id="requests-title" title="Quote requests" description="The latest 20. Each one is also in Quotes." />
          {requests.length ? (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/quotes/${r.quote.reference}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-ink">{r.quote.company ?? r.quote.name}</span>
                      <span className="text-callout text-ink-muted">
                        {r.quote.reference}, {(r.sites as unknown[]).length} {(r.sites as unknown[]).length === 1 ? "site" : "sites"}, {r.quote.market.toUpperCase()}
                      </span>
                    </span>
                    <span className="text-callout text-ink-muted">{formatDay(r.createdAt, true)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-ink-muted">None yet.</p>
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
