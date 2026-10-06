import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment, toDateOnly } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { previousMonth } from "@/server/security/reports";
import { HEALTH_LABEL, INCIDENT_STATUS_LABEL, SEVERITY_LABEL, SEVERITY_TONE, TENANT_STATUS_LABEL } from "@/server/soc/labels";
import { DeviceForm, RemoveDeviceButton, SocReportForm, TenantForm } from "../../forms";

export const metadata: Metadata = { title: "Managed security" };

const HEALTH_TONE = { HEALTHY: "positive", AT_RISK: "warning", OFFLINE: "neutral", UNPROTECTED: "negative" } as const;

/** One customer's managed security: tenant, install link, devices, monthly reports and incidents. */
export default async function SocCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffCan("workSoc");
  const { id } = await params;
  const organisation = await prisma.organisation.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!organisation) notFound();
  const [tenant, devices, reports, incidents] = await Promise.all([
    prisma.securityTenant.findUnique({ where: { organisationId: id }, include: { provider: { select: { name: true, type: true } } } }),
    prisma.securityDevice.findMany({ where: { organisationId: id }, orderBy: { name: "asc" } }),
    prisma.socReport.findMany({ where: { organisationId: id }, orderBy: { month: "desc" }, take: 12 }),
    prisma.securityIncident.findMany({ where: { organisationId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const healths = Object.entries(HEALTH_LABEL).map(([value, label]) => ({ value, label }));
  const statuses = Object.entries(TENANT_STATUS_LABEL).map(([value, label]) => ({ value, label }));
  const lastMonth = previousMonth(new Date());

  return (
    <>
      <Link href="/admin/soc" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> SOC
      </Link>
      <PageHeader
        title={organisation.name}
        description={tenant ? `Managed security with ${tenant.provider.name} (staff only).` : "No managed security yet."}
        actions={tenant ? <Badge tone={tenant.status === "ACTIVE" ? "positive" : "info"}>{TENANT_STATUS_LABEL[tenant.status]}</Badge> : null}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="tenant-title">
            <CardHeader id="tenant-title" title="Set-up" description={tenant?.provider.type === "WEBHOOK" ? "The tenant, install link and devices are fetched from the provider every 5 minutes. Changes here are kept until the provider sends new ones." : "Manual mode: create the tenant in the provider's portal, then record it here."} />
            <CardBody>
              {!tenant ? <Alert tone="info">Saving this starts managed security for the customer with the active provider.</Alert> : null}
              <TenantForm
                organisationId={id}
                statuses={statuses}
                values={{ tenantRef: tenant?.tenantRef ?? "", status: tenant?.status ?? "PENDING", enrolmentLink: tenant?.enrolmentLink ?? "", enrolmentNote: tenant?.enrolmentNote ?? "" }}
              />
            </CardBody>
          </Card>
          <Card aria-labelledby="devices-title">
            <CardHeader id="devices-title" title="Devices" description="Customers see these, and they count in the security score." />
            {devices.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">No devices yet.</p>
              </CardBody>
            ) : (
              <div className="divide-y divide-border">
                {devices.map((d) => (
                  <details key={d.id} className="px-5 py-4 sm:px-6">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                      <span className="text-ink">
                        <span className="font-semibold">{d.name}</span>
                        {d.os ? `, ${d.os}` : ""}
                      </span>
                      <span className="flex items-center gap-3 text-callout text-ink-muted">
                        {d.lastSeenAt ? `Seen ${formatMoment(d.lastSeenAt, DEFAULT_TIME_ZONE)}` : "Not seen yet"}
                        <Badge tone={HEALTH_TONE[d.health]}>{HEALTH_LABEL[d.health]}</Badge>
                      </span>
                    </summary>
                    <div className="flex flex-col gap-3 pt-4">
                      <DeviceForm organisationId={id} healths={healths} device={{ id: d.id, name: d.name, os: d.os ?? "", health: d.health, lastSeenAt: d.lastSeenAt ? toDateOnly(d.lastSeenAt) : "" }} />
                      <RemoveDeviceButton organisationId={id} id={d.id} />
                    </div>
                  </details>
                ))}
              </div>
            )}
            {tenant ? (
              <CardBody className="border-t border-border">
                <DeviceForm organisationId={id} healths={healths} />
              </CardBody>
            ) : null}
          </Card>
          <Card aria-labelledby="incidents-title">
            <CardHeader id="incidents-title" title="Incidents" />
            {incidents.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">None.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {incidents.map((i) => (
                  <li key={i.id}>
                    <Link href={`/admin/soc/${i.reference}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2 sm:px-6">
                      <span className="text-ink">
                        {i.title} <span className="text-callout text-ink-muted">({i.reference})</span>
                      </span>
                      <span className="flex gap-2">
                        <Badge tone={SEVERITY_TONE[i.severity]}>{SEVERITY_LABEL[i.severity]}</Badge>
                        <Badge tone={i.status === "RESOLVED" ? "positive" : "info"}>{INCIDENT_STATUS_LABEL[i.status]}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="reports-title">
            <CardHeader id="reports-title" title="Monthly reports" description="With an API, fetched on the first three days of each month." />
            <CardBody className="flex flex-col gap-4">
              {reports.length ? (
                <ul className="flex flex-col gap-2">
                  {reports.map((r) => (
                    <li key={r.id} className="text-ink">
                      <span className="font-semibold">{r.month}</span>: {r.url ? <a className="text-link hover:underline" href={r.url} rel="noreferrer" target="_blank">{r.title}</a> : r.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-muted">None yet.</p>
              )}
              <SocReportForm organisationId={id} month={lastMonth} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
