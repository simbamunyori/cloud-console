import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { IMPACT_LABEL, recentIncidents, serviceStatus } from "@/server/status/status";
import { OpenIncidentForm, ResolveButton, UpdateIncidentForm } from "./forms";

export const metadata: Metadata = { title: "Service status" };

export default async function StatusPage() {
  await requireStaffCan("manageStatus");
  const [status, recent] = await Promise.all([serviceStatus(prisma), recentIncidents(prisma)]);
  return (
    <>
      <PageHeader title="Service status" description={`The site says: ${status.label}. Every public page shows this in its top strip and footer, and the status page lists the details.`} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] [&>*]:min-w-0">
        <Card aria-labelledby="open-title">
          <CardHeader id="open-title" title="Open incidents" />
          {status.open.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing open">
              Automatic checks post and resolve their own incidents. Post one here when customers are affected by anything else.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {status.open.map((i) => (
                <li key={i.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="flex flex-col">
                      <span className="font-semibold text-ink">{i.title}</span>
                      <span className="text-callout text-ink-muted">Since {formatMoment(i.startedAt, DEFAULT_TIME_ZONE)}</span>
                    </span>
                    <Badge tone={i.impact === "OUTAGE" ? "negative" : i.impact === "DEGRADED" ? "warning" : "neutral"}>{IMPACT_LABEL[i.impact]}</Badge>
                  </div>
                  <UpdateIncidentForm id={i.id} message={i.message} />
                  <ResolveButton id={i.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="post-title">
          <CardHeader id="post-title" title="Post an incident" />
          <CardBody>
            <OpenIncidentForm />
          </CardBody>
        </Card>
      </div>
      {recent.length ? (
        <Card aria-labelledby="recent-title" className="mt-6">
          <CardHeader id="recent-title" title="Resolved in the last 30 days" />
          <ul className="divide-y divide-border">
            {recent.map((i) => (
              <li key={i.id} className="flex flex-col px-5 py-3 sm:px-6">
                <span className="font-semibold text-ink">{i.title}</span>
                <span className="text-callout text-ink-muted">
                  {IMPACT_LABEL[i.impact]}, {formatMoment(i.startedAt, DEFAULT_TIME_ZONE)} to {formatMoment(i.resolvedAt!, DEFAULT_TIME_ZONE)}. Opened by {i.openedBy}
                  {i.resolvedBy ? `, resolved by ${i.resolvedBy}` : ""}.
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
