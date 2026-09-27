import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { requireStaffCan } from "@/server/admin/context";
import { taskQueue } from "@/server/admin/tasks";
import { prisma } from "@/server/db";
import { staffCan } from "@/server/staff/access";
import { TaskActions } from "../forms";

export const metadata: Metadata = { title: "Setup queue" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { staff } = await requireStaffCan("viewCustomers");
  const { show } = await searchParams;
  const done = show === "done";
  const tasks = await taskQueue(prisma, { status: done ? "done" : "open" });
  const canWork = staffCan(staff, "workTasks");
  const now = new Date();

  return (
    <>
      <PageHeader title="Setup queue" description="Orders we set up by hand until each supplier is connected. Soonest due first." />
      <nav aria-label="Filter" className="mb-6 flex gap-2">
        {[
          ["To do", "/admin/tasks", !done],
          ["Done", "/admin/tasks?show=done", done],
        ].map(([label, href, active]) => (
          <Link key={String(label)} href={String(href)} aria-current={active ? "page" : undefined} className={cn("rounded-full px-4 py-2 text-callout font-semibold", active ? "bg-navy text-on-navy" : "bg-surface-2 text-ink hover:bg-border")}>
            {label}
          </Link>
        ))}
      </nav>
      {tasks.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={done ? "Nothing finished yet" : "Nothing waiting"}>
          {done ? "Finished tasks show here." : "New orders will appear here."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {tasks.map((t) => {
            const late = !done && t.expectedBy < now;
            return (
              <Card key={t.id} aria-labelledby={`task-${t.id}`}>
                <CardBody className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-callout text-ink-muted">
                        <Link href={`/admin/customers/${t.organisation.id}`} className="text-link hover:underline">
                          {t.organisation.name}
                        </Link>
                        {t.order ? `, order ${t.order.reference}` : ""}
                      </span>
                      <h2 id={`task-${t.id}`} className="text-headline text-ink">
                        {t.title}
                      </h2>
                    </div>
                    {done ? (
                      <Badge tone="positive">Done</Badge>
                    ) : late ? (
                      <Badge tone="negative">Late</Badge>
                    ) : t.status === "IN_PROGRESS" ? (
                      <Badge tone="info">In progress</Badge>
                    ) : (
                      <Badge>Waiting</Badge>
                    )}
                  </div>
                  <p className="text-callout text-ink-muted">
                    {done
                      ? `Done by ${t.completedBy?.name ?? "someone"} ${t.completedAt ? formatMoment(t.completedAt, DEFAULT_TIME_ZONE) : ""}`
                      : `Customer expects it by ${formatMoment(t.expectedBy, DEFAULT_TIME_ZONE)}${t.assignee ? `. ${t.assignee.name} has it` : ""}`}
                  </p>
                  <pre className="overflow-x-auto rounded-md bg-surface-2 p-4 font-sans text-callout whitespace-pre-wrap text-ink-body">{t.instructions}</pre>
                  {t.notes ? <p className="text-callout text-ink-body">Note: {t.notes}</p> : null}
                  {!done && canWork ? <TaskActions taskId={t.id} canStart={t.assigneeId !== staff.userId} /> : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
