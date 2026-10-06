import { ArrowRight, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { staffCan } from "@/server/staff/access";
import { myQueues, UNITS } from "@/server/units/units";

export const metadata: Metadata = { title: "My work" };

/** The queues routed to the colleague's units (U7), with what is waiting in each. */
export default async function MyWorkPage() {
  const { staff } = await requireStaff();
  const { units, queues } = await myQueues(prisma, staff.userId, new Date());
  const waiting = queues.reduce((n, q) => n + q.waiting, 0);
  return (
    <>
      <PageHeader
        title="My work"
        description={units.length ? `The queues for ${units.map((u) => UNITS[u].label).join(", ")}. ${waiting ? `${waiting} waiting.` : "Nothing waiting."}` : "The queues routed to your units."}
      />
      {!units.length ? (
        <EmptyState
          icon={Inbox}
          title="You're not in a unit yet"
          action={
            staffCan(staff, "manageStaff") ? (
              <Link href="/admin/units" className="font-semibold text-link hover:underline">
                Open Units
              </Link>
            ) : undefined
          }
        >
          {staffCan(staff, "manageStaff") ? "Add yourself and your colleagues to units in Units." : "An Admin adds you to your units. Until then, use the menu."}
        </EmptyState>
      ) : queues.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {queues.map((q) => (
            <Card key={q.key}>
              <Link href={q.href} className="group flex h-full flex-col gap-3 rounded-lg p-5 hover:bg-surface-2">
                <span className="flex items-start justify-between gap-3">
                  <span className="font-semibold text-ink">{q.label}</span>
                  {q.waiting ? <Badge tone="warning">{q.waiting} waiting</Badge> : <Badge tone="positive">Clear</Badge>}
                </span>
                <span className="text-callout text-ink-muted">{UNITS[q.unit].label}</span>
                <span className="mt-auto inline-flex items-center gap-1 text-callout font-semibold text-link">
                  Open <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardBody>
            <p className="text-ink-muted">No queues are routed to your units.</p>
          </CardBody>
        </Card>
      )}
    </>
  );
}
