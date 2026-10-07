import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { prisma } from "@/server/db";
import { requireMember } from "@/server/org/context";
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, SEVERITY_TONE } from "@/server/soc/labels";
import { customerIncident, managedSecurityOn } from "@/server/soc/soc";

export const metadata: Metadata = { title: "Security incident" };

export default async function IncidentPage({ params }: { params: Promise<{ reference: string }> }) {
  const { db, organisation } = await requireMember();
  if (!(await managedSecurityOn(prisma))) notFound();
  const incident = await customerIncident(db, decodeURIComponent((await params).reference));
  if (!incident) notFound();
  const tz = organisation.timeZone;
  return (
    <>
      <Link href="/app/security/managed" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Managed security
      </Link>
      <PageHeader
        eyebrow={incident.reference}
        title={incident.title}
        actions={
          <>
            <Badge tone={SEVERITY_TONE[incident.severity]}>{SEVERITY_LABEL[incident.severity]}</Badge>
            <Badge tone={incident.status === "RESOLVED" ? "positive" : "info"}>{INCIDENT_STATUS_LABEL[incident.status]}</Badge>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <Card aria-labelledby="timeline-title">
          <CardHeader id="timeline-title" title="Timeline" />
          <ol className="divide-y divide-border">
            {incident.events.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                <span className="text-ink">{e.body}</span>
                <span className="text-callout text-ink-muted">{formatMoment(e.createdAt, tz)}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div>
              <h2 className="text-headline text-ink">What happened</h2>
              <p className="mt-1 text-ink-body">{incident.summary}</p>
            </div>
            <div>
              <h2 className="text-headline text-ink">What we&apos;re doing</h2>
              <p className="mt-1 text-ink-body">{incident.ourAction ?? "Our security operations centre is looking into it."}</p>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-callout">
              {incident.deviceName ? (
                <>
                  <dt className="text-ink-muted">Computer</dt>
                  <dd className="text-ink">{incident.deviceName}</dd>
                </>
              ) : null}
              <dt className="text-ink-muted">Opened</dt>
              <dd className="text-ink">{formatMoment(incident.createdAt, tz)}</dd>
              {incident.resolvedAt ? (
                <>
                  <dt className="text-ink-muted">Resolved</dt>
                  <dd className="text-ink">{formatMoment(incident.resolvedAt, tz)}</dd>
                </>
              ) : null}
            </dl>
            <Link href="/app/support/new" className="text-callout font-semibold text-link hover:underline">
              Ask us about it
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
