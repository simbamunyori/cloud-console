import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, SEVERITY_TONE } from "@/server/soc/labels";
import { EscalateForm, IncidentForm } from "../forms";

export const metadata: Metadata = { title: "Security incident" };

/** One incident: work it, escalate it, and the full timeline including internal notes. */
export default async function SocIncidentPage({ params }: { params: Promise<{ reference: string }> }) {
  await requireStaffCan("workSoc");
  const reference = decodeURIComponent((await params).reference);
  const incident = await prisma.securityIncident.findUnique({
    where: { reference },
    include: {
      organisation: { select: { id: true, name: true } },
      provider: { select: { name: true } },
      assignee: { select: { name: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!incident) notFound();
  const staff = await prisma.user.findMany({ where: { kind: "STAFF", staffRole: { not: null }, deactivatedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const statuses = Object.entries(INCIDENT_STATUS_LABEL).map(([value, label]) => ({ value, label }));
  const tz = DEFAULT_TIME_ZONE;

  return (
    <>
      <Link href="/admin/soc" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> SOC
      </Link>
      <PageHeader
        eyebrow={incident.reference}
        title={incident.title}
        description={`${incident.organisation.name}. Opened ${formatMoment(incident.createdAt, tz)}${incident.provider ? ` from ${incident.provider.name}${incident.providerRef ? ` (${incident.providerRef})` : ""}` : " by our team"}.`}
        actions={
          <>
            <Badge tone={SEVERITY_TONE[incident.severity]}>{SEVERITY_LABEL[incident.severity]}</Badge>
            <Badge tone={incident.status === "RESOLVED" ? "positive" : "info"}>{INCIDENT_STATUS_LABEL[incident.status]}</Badge>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="what-title">
            <CardHeader id="what-title" title="What happened" />
            <CardBody className="flex flex-col gap-2">
              <p className="whitespace-pre-line text-ink">{incident.summary}</p>
              <p className="text-callout text-ink-muted">
                {incident.deviceName ? `Device: ${incident.deviceName}. ` : ""}
                {incident.firstResponseAt ? `First response ${formatMoment(incident.firstResponseAt, tz)}.` : `Answer by ${formatMoment(incident.respondBy, tz)}.`}
                {incident.escalationLevel ? ` Escalated to level ${incident.escalationLevel}.` : ""}
                {incident.resolvedAt ? ` Resolved ${formatMoment(incident.resolvedAt, tz)}.` : ""}
              </p>
              <Link className="text-callout text-link hover:underline" href={`/admin/soc/customers/${incident.organisation.id}`}>
                {incident.organisation.name}&apos;s managed security
              </Link>
            </CardBody>
          </Card>
          <Card aria-labelledby="timeline-title">
            <CardHeader id="timeline-title" title="Timeline" description="Entries marked staff only never reach the customer." />
            <ol className="divide-y divide-border">
              {incident.events.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 px-5 py-4 sm:px-6">
                  <span className="flex flex-wrap items-center gap-2 text-callout text-ink-muted">
                    {formatMoment(e.createdAt, tz)}
                    {e.actorLabel ? `, ${e.actorLabel}` : ""}
                    {e.visibleToCustomer ? null : <Badge>Staff only</Badge>}
                  </span>
                  <span className="whitespace-pre-line text-ink">{e.body}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="work-title">
            <CardHeader id="work-title" title="Work it" />
            <CardBody>
              <IncidentForm
                id={incident.id}
                reference={incident.reference}
                values={{ status: incident.status, ourAction: incident.ourAction ?? "", assigneeId: incident.assigneeId ?? "" }}
                statuses={statuses}
                staff={staff.map((s) => ({ value: s.id, label: s.name }))}
              />
            </CardBody>
          </Card>
          {incident.status !== "RESOLVED" ? (
            <Card aria-labelledby="escalate-title">
              <CardHeader id="escalate-title" title="Escalate" description="Raises it a level and emails the escalation address." />
              <CardBody>
                <EscalateForm id={incident.id} reference={incident.reference} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
