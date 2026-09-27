import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/app/status";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { company } from "@/config/app";
import { formatMoney, money } from "@/lib/domain/money";
import { requireStaffCan } from "@/server/admin/context";
import { recentOrders } from "@/server/admin/customers";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  await requireStaffCan("viewCustomers");
  const orders = await recentOrders(prisma);
  return (
    <>
      <PageHeader title="Orders" description="The latest 100, newest first. Orders being set up have a task in the setup queue." />
      <Card>
        <ul className="divide-y divide-border">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ink">
                  {o.product.name}
                  {o.quantity > 1 ? ` x ${o.quantity}` : ""}
                </span>
                <span className="truncate text-callout text-ink-muted">
                  <Link href={`/admin/customers/${o.organisation.id}`} className="text-link hover:underline">
                    {o.organisation.name}
                  </Link>
                  , <span className="tabular-nums">{o.reference}</span>, {formatMoment(o.createdAt, DEFAULT_TIME_ZONE)}
                </span>
              </span>
              <span className="hidden text-callout text-ink tabular-nums sm:inline">{formatMoney(money(o.monthlyTotalMinor, o.currency), company.staffLocale)} a month</span>
              <OrderStatusBadge status={o.status} />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
