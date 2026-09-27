import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { listCustomers } from "@/server/admin/customers";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaffCan("viewCustomers");
  const { q = "" } = await searchParams;
  const customers = await listCustomers(prisma, q);

  return (
    <>
      <PageHeader title="Customers" />
      <form method="get" role="search" className="mb-6 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="q" className="sr-only">
          Organisation name or a person&apos;s email
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Organisation name or a person's email" className="h-11 w-full rounded-md border border-border-strong bg-surface-1 px-4 text-body text-ink placeholder:text-ink-muted sm:flex-1" />
        <Button type="submit" variant="secondary">
          <Search aria-hidden /> Search
        </Button>
      </form>
      <Card>
        {customers.length === 0 ? (
          <p className="px-5 py-6 text-ink-muted sm:px-6">No customers match.</p>
        ) : (
          <ul className="divide-y divide-border">
            {customers.map((c) => {
              const owner = c.memberships[0]?.user;
              return (
                <li key={c.id}>
                  <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-2 sm:px-6">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold text-ink">{c.name}</span>
                      <span className="truncate text-callout text-ink-muted">
                        {owner ? `${owner.name}, ${owner.email}` : "No owner"} · {c._count.memberships} {c._count.memberships === 1 ? "person" : "people"} · since {formatDay(c.createdAt, true)}
                      </span>
                    </span>
                    {c.deletedAt ? <Badge>Closed</Badge> : c._count.orders ? <Badge tone="info">{c._count.orders} being set up</Badge> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
