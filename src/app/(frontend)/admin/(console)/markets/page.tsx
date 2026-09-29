import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { countryName } from "@/lib/countries";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { CATCH_ALL, listMarkets } from "@/server/markets/markets";

export const metadata: Metadata = { title: "Markets" };

export default async function MarketsPage() {
  await requireStaffCan("manageMarkets");
  const [markets, counts] = await Promise.all([listMarkets(prisma), prisma.organisation.groupBy({ by: ["billingMarket"], _count: true, where: { deletedAt: null } })]);
  const customers = new Map(counts.map((c) => [c.billingMarket, c._count]));

  return (
    <>
      <PageHeader
        title="Markets"
        description="A market sets the currency, prices, catalogue, contacts and legal pages for its countries. Visitors whose country we can't tell see the default market."
      />
      <Card>
        <ul className="divide-y divide-border">
          {markets.map((m) => (
            <li key={m.code}>
              <Link href={`/admin/markets/${m.code}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-2 sm:px-6">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-ink">
                    {m.name} <span className="font-normal text-ink-muted">/{m.code}</span>
                  </span>
                  <span className="text-callout text-ink-muted">
                    {m.currency} · {m.code === CATCH_ALL ? "every other country" : m.countries.map((c) => countryName(c)).join(", ")} · {customers.get(m.code) ?? 0}{" "}
                    {customers.get(m.code) === 1 ? "customer" : "customers"}
                  </span>
                </span>
                <span className="flex flex-wrap justify-end gap-2">
                  {m.isDefault ? <Badge tone="info">Default</Badge> : null}
                  {m.enabled ? <Badge tone="positive">On</Badge> : <Badge>Off</Badge>}
                  {m.taxEnabled ? null : <Badge tone="warning">No tax</Badge>}
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
