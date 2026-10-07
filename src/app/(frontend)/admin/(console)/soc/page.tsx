import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, SEVERITY_TONE, TENANT_STATUS_LABEL } from "@/server/soc/labels";
import { activeProvider } from "@/server/soc/providers";
import { managedSecurityOn, socQueue, socSettings } from "@/server/soc/soc";
import { staffCan } from "@/server/staff/access";
import { NewIncidentForm, SocSettingsForm } from "./forms";

export const metadata: Metadata = { title: "SOC" };

/** The security operations queue (docs/STRATEGY_ROLLOUT.md, U5): open incidents, most urgent first, and each customer's managed security. */
export default async function SocPage() {
  const { staff } = await requireStaffCan("workSoc");
  const now = new Date();
  const [queue, settings, provider, featureOn, tenants, customers] = await Promise.all([
    socQueue(prisma),
    socSettings(prisma),
    activeProvider(prisma),
    managedSecurityOn(prisma),
    prisma.securityTenant.findMany({ orderBy: { createdAt: "desc" }, include: { organisation: { select: { id: true, name: true } }, _count: { select: { devices: true } } } }),
    prisma.organisation.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const severities = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => ({ value: s, label: `${SEVERITY_LABEL[s]}: answer within ${settings.targets[s]} minutes` }));

  return (
    <>
      <PageHeader title="SOC" description={`Security incidents and customers' managed security.${provider ? ` Provider: ${provider.name} (staff only; customers never see it).` : ""}`} />
      <div className="flex flex-col gap-6">
        {!provider ? (
          <Alert tone="info">
            No security provider is active. Set one up in{" "}
            <Link className="text-link underline" href="/admin/partners/security">
              Partners
            </Link>
            , then turn on &quot;Managed security&quot; in Features.
          </Alert>
        ) : !featureOn ? (
          <Alert tone="info">Customers can only register interest until &quot;Managed security&quot; is on in Features.</Alert>
        ) : null}

        <Card aria-labelledby="queue-title">
          <CardHeader id="queue-title" title="Open incidents" description="Most urgent response target first. Incidents nobody answers by their target are escalated every 5 minutes." />
          {queue.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">Nothing open.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {queue.map((i) => {
                const late = !i.firstResponseAt && i.respondBy < now;
                return (
                  <li key={i.id}>
                    <Link href={`/admin/soc/${i.reference}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-ink">
                          <span className="font-semibold">{i.organisation.name}</span>: {i.title}
                        </span>
                        <span className="text-callout text-ink-muted">
                          {i.reference}, opened {formatMoment(i.createdAt, DEFAULT_TIME_ZONE)}
                          {i.deviceName ? `, ${i.deviceName}` : ""}. {i.assignee ? `Assigned to ${i.assignee.name}.` : "Not assigned."}
                          {i.firstResponseAt ? "" : ` Answer by ${formatMoment(i.respondBy, DEFAULT_TIME_ZONE)}.`}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {late ? <Badge tone="negative">Late</Badge> : null}
                        {i.escalationLevel ? <Badge tone="warning">Escalated {i.escalationLevel}</Badge> : null}
                        <Badge tone={SEVERITY_TONE[i.severity]}>{SEVERITY_LABEL[i.severity]}</Badge>
                        <Badge tone="info">{INCIDENT_STATUS_LABEL[i.status]}</Badge>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
          <Card aria-labelledby="tenants-title">
            <CardHeader id="tenants-title" title="Customers with managed security" description="Each order for managed security adds the customer here. Open one to set its install link, devices and monthly reports." />
            {tenants.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">None yet.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {tenants.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/soc/customers/${t.organisation.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-2 sm:px-6">
                      <span className="flex flex-col">
                        <span className="font-semibold text-ink">{t.organisation.name}</span>
                        <span className="text-callout text-ink-muted">
                          {t._count.devices} {t._count.devices === 1 ? "device" : "devices"}
                          {t.tenantRef ? `, tenant ${t.tenantRef}` : ", no tenant reference yet"}
                        </span>
                      </span>
                      <Badge tone={t.status === "ACTIVE" ? "positive" : t.status === "PENDING" ? "info" : "neutral"}>{TENANT_STATUS_LABEL[t.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="flex flex-col gap-6">
            <Card aria-labelledby="new-title">
              <CardHeader id="new-title" title="Open an incident" description="For manual mode, or a customer who calls in." />
              <CardBody>
                <NewIncidentForm customers={customers.map((c) => ({ value: c.id, label: c.name }))} severities={severities} />
              </CardBody>
            </Card>
            {staffCan(staff, "managePartners") ? (
              <Card aria-labelledby="settings-title">
                <CardHeader id="settings-title" title="Response targets" description="How soon we answer each severity. Late incidents are escalated." />
                <CardBody>
                  <SocSettingsForm
                    values={{
                      critical: String(settings.targets.CRITICAL),
                      high: String(settings.targets.HIGH),
                      medium: String(settings.targets.MEDIUM),
                      low: String(settings.targets.LOW),
                      escalationEmail: settings.escalationEmail ?? "",
                    }}
                  />
                </CardBody>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
