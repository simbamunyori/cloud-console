import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/server/admin/context";
import { staffOverview } from "@/server/admin/customers";
import { prisma } from "@/server/db";
import { staffCan } from "@/server/staff/access";

export const metadata: Metadata = { title: "Staff overview" };

export default async function AdminHome() {
  const { staff } = await requireStaff();
  const c = await staffOverview(prisma);
  const tiles = [
    { label: "Tasks waiting", value: c.openTasks, hint: c.lateTasks ? `${c.lateTasks} past their expected time` : "None late", href: "/admin/tasks", show: true, alert: c.lateTasks > 0 },
    { label: "Tickets that need us", value: c.tickets, hint: "Oldest first", href: "/admin/tickets", show: true, alert: c.tickets > 0 },
    { label: "Orders being set up", value: c.settingUp, hint: "Customers are waiting on these", href: "/admin/orders", show: true, alert: false },
    { label: "EFT payments to check", value: c.eft, hint: "Customers say they've paid", href: "/admin/payments", show: staffCan(staff, "confirmPayments"), alert: c.eft > 0 },
  ].filter((t) => t.show);

  return (
    <>
      <PageHeader title={`Hello, ${staff.name.split(" ")[0]}`} description="What needs our team today." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
        {tiles.map((t) => (
          <Card key={t.label} className="p-0">
            <Link href={t.href} className="flex h-full flex-col gap-1 rounded-lg p-5 hover:bg-surface-2">
              <span className="text-callout text-ink-muted">{t.label}</span>
              <span className={`text-title-1 tabular-nums ${t.alert ? "text-negative" : "text-ink"}`}>{t.value}</span>
              <span className="flex items-center justify-between gap-2 text-callout text-ink-muted">
                {t.hint} <ArrowRight aria-hidden className="size-4 shrink-0 text-link" />
              </span>
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}
