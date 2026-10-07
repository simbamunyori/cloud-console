import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment, toDateOnly } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { customerBackupOn, DESTINATIONS, HEALTH_LABEL, RESTORE_LABEL, staffBackups } from "@/server/backup/backup";
import { prisma } from "@/server/db";
import { partnerConfig } from "@/server/partners/partners";
import { AddProtectionForm, ProtectionForm, RestoreActions, SyncButton } from "./forms";

export const metadata: Metadata = { title: "Backups" };

const TONE = { PENDING: "info", OK: "positive", WARNING: "warning", FAILED: "negative" } as const;

/** Off-site backup for customers (docs/STRATEGY_ROLLOUT.md, U3): every backup's status and the restore queue. */
export default async function BackupsPage() {
  await requireStaffCan("workTasks");
  const [{ protections, restores }, partner, featureOn, customers] = await Promise.all([
    staffBackups(prisma),
    partnerConfig(prisma, "backup-provider"),
    customerBackupOn(prisma),
    prisma.organisation.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const api = partner?.enabled && partner.settings.mode === "api";
  const healths = Object.entries(HEALTH_LABEL).map(([value, label]) => ({ value, label }));

  return (
    <>
      <PageHeader
        title="Backups"
        description={`Customers' off-site backups and their restores.${partner?.settings.name ? ` Provider: ${partner.settings.name} (staff only; customers never see it).` : ""}`}
      />
      <div className="flex flex-col gap-6">
        {!partner?.enabled ? (
          <Alert tone="info">
            The backup provider isn&apos;t switched on. Set it up in <Link className="text-link underline" href="/admin/partners/backup-provider">Partners</Link>, then turn on &quot;Off-site backup in the console&quot; in Features.
          </Alert>
        ) : !featureOn ? (
          <Alert tone="info">Customers don&apos;t see their Backup page until &quot;Off-site backup in the console&quot; is on in Features.</Alert>
        ) : null}

        <Card aria-labelledby="restores-title">
          <CardHeader id="restores-title" title="Restores waiting" description="Each one is also a task in the setup queue when our team does it by hand." />
          {restores.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">Nothing waiting.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {restores.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-ink">
                      <Link className="font-semibold text-link hover:underline" href={`/admin/customers/${r.organisation.id}`}>
                        {r.organisation.name}
                      </Link>
                      : {r.what}
                    </span>
                    <span className="text-callout text-ink-muted">
                      {r.protection.label}
                      {r.protection.providerRef ? ` (${r.protection.providerRef})` : ""}, from {toDateOnly(r.fromDay)}, {DESTINATIONS[r.destination as keyof typeof DESTINATIONS]?.toLowerCase() ?? r.destination}. Asked{" "}
                      {formatMoment(r.createdAt, DEFAULT_TIME_ZONE)}.{r.providerRef ? ` Provider restore ${r.providerRef}.` : ""}
                    </span>
                    <Badge tone="info" className="self-start">
                      {RESTORE_LABEL[r.status]}
                    </Badge>
                  </div>
                  <RestoreActions
                    id={r.id}
                    next={(r.status === "REQUESTED" ? (["IN_PROGRESS", "DONE", "CANCELLED"] as const) : (["DONE", "CANCELLED"] as const)).map((s) => ({
                      value: s,
                      label: s === "IN_PROGRESS" ? "Mark in progress" : s === "DONE" ? "Mark done" : "Cancel",
                    }))}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
          <Card aria-labelledby="protections-title">
            <CardHeader
              id="protections-title"
              title="Customers' backups"
              description={api ? "Status is fetched from the provider every hour for backups with a provider reference." : "Manual mode: record each backup's status from the provider's portal."}
            />
            {protections.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">None yet. Each order for a backup, or a plan that includes one, adds it here.</p>
              </CardBody>
            ) : (
              <div className="divide-y divide-border">
                {protections.map((p) => (
                  <details key={p.id} className="group px-5 py-4 sm:px-6">
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                      <span className="text-ink">
                        <span className="font-semibold">{p.organisation.name}</span>: {p.label}
                      </span>
                      <span className="flex items-center gap-3 text-callout text-ink-muted">
                        {p.lastSuccessAt ? `Last good ${formatMoment(p.lastSuccessAt, DEFAULT_TIME_ZONE)}` : "No copy yet"}
                        <Badge tone={TONE[p.health]}>{HEALTH_LABEL[p.health]}</Badge>
                      </span>
                    </summary>
                    <div className="pt-4">
                      <ProtectionForm
                        id={p.id}
                        healths={healths}
                        values={{
                          label: p.label,
                          health: p.health,
                          lastSuccessAt: p.lastSuccessAt ? toDateOnly(p.lastSuccessAt) : "",
                          retentionDays: p.retentionDays ? String(p.retentionDays) : "",
                          coverage: p.coverage ?? "",
                          providerRef: p.providerRef ?? "",
                          notes: p.notes ?? "",
                        }}
                      />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Card>
          <div className="flex flex-col gap-6">
            <Card aria-labelledby="add-title">
              <CardHeader id="add-title" title="Add a backup" description="For a customer whose backup was set up before the console, or by hand." />
              <CardBody>
                <AddProtectionForm customers={customers.map((c) => ({ value: c.id, label: c.name }))} />
              </CardBody>
            </Card>
            {api ? (
              <Card aria-labelledby="sync-title">
                <CardHeader id="sync-title" title="Fetch status" description="Runs every hour on its own." />
                <CardBody>
                  <SyncButton />
                </CardBody>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
