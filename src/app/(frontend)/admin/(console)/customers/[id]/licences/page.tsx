import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { tenantOverview } from "@/server/licences/licences";
import { onboardings } from "@/server/licences/onboarding";
import { tenantProvider, VENDOR_LABEL } from "@/server/licences/provider";
import { staffCan } from "@/server/staff/access";
import { FinishOnboardingButton, LinkTenantForm, OnboardingForm, RecordLicenceForm, RecordUserForm, StaffTick } from "./forms";

export const metadata: Metadata = { title: "Users and licences" };

const WAITING = { ASSIGN: "Licence to give", UNASSIGN: "Licence to take back", ADD_USER: "To add", REMOVE_USER: "To remove" } as const;

/**
 * A customer's tenants as the console knows them. Until the vendor APIs
 * are connected, staff keep this in step with the partner portal; the
 * customer's own changes arrive as tasks in the queue.
 */
export default async function CustomerLicencesPage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await requireStaffCan("viewCustomers");
  const { id } = await params;
  const org = await prisma.organisation.findUnique({ where: { id }, select: { id: true, name: true, timeZone: true } });
  if (!org) notFound();
  const [tenants, setups] = await Promise.all([tenantOverview(prisma, org.id), onboardings(prisma, org.id)]);
  const edit = staffCan(staff, "workTasks");
  const missing = (["MICROSOFT", "GOOGLE"] as const).filter((v) => !tenants.some((t) => t.vendor === v)).map((v) => ({ value: v, label: VENDOR_LABEL[v] }));
  const waiting = await prisma.licenceChange.count({ where: { organisationId: org.id, status: "PENDING" } });

  return (
    <>
      <Link href={`/admin/customers/${org.id}`} className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {org.name}
      </Link>
      <PageHeader title="Users and licences" eyebrow={org.name} description="What the console shows the customer. Keep it the same as the partner portal; every change here is in their activity log." />
      <div className="flex flex-col gap-6">
        {tenantProvider().automatic ? <Alert tone="warning">This server uses the demo tenant provider: customer changes apply at once and reach no vendor.</Alert> : null}
        {waiting ? (
          <Alert tone="info">
            {waiting} customer {waiting === 1 ? "change is" : "changes are"} waiting.{" "}
            <Link href="/admin/tasks" className="text-link underline underline-offset-2">
              Open the task queue
            </Link>
            . Marking a task done applies its change here.
          </Alert>
        ) : null}

        {tenants.map((t) => (
          <section key={t.id} aria-labelledby={`t-${t.id}`} className="flex flex-col gap-4">
            <div className="flex flex-col gap-0.5">
              <h2 id={`t-${t.id}`} className="text-title-2 text-ink">
                {t.vendorLabel}, {t.primaryDomain}
              </h2>
              <p className="text-callout text-ink-muted">{t.lastSyncedAt ? `Last checked ${formatMoment(t.lastSyncedAt, org.timeZone)}` : "Not checked yet"}</p>
            </div>
            {(() => {
              const o = setups.find((x) => x.tenantId === t.id);
              // A tenant already in use needs no setup; one just linked is offered one.
              if (o?.completedAt || (!o && t.users.length)) return null;
              return (
                <Card aria-labelledby={`setup-${t.id}`}>
                  <CardHeader
                    id={`setup-${t.id}`}
                    title={o ? (o.kind === "TRANSFER" ? "Transfer in progress" : "Setup in progress") : "Setup"}
                    description={o ? "The customer sees these steps on their Users and licences page." : "Start a setup to show the customer their DNS records, email move booking and, for a transfer, the checklist."}
                  />
                  {o ? (
                    <CardBody className="flex flex-col gap-4">
                      <ul className="flex flex-col gap-2 text-callout">
                        <li className="flex flex-wrap items-center gap-2">
                          Domain: {o.domainVerifiedAt ? <Badge tone="positive">Proven {formatMoment(o.domainVerifiedAt, org.timeZone)}</Badge> : <Badge tone="warning">{o.records.some((r) => r.key === "verify") ? "Not proven yet" : "Needs the verification value"}</Badge>}
                        </li>
                        <li className="flex flex-wrap items-center gap-2">
                          Email move: {o.migration ? <Badge tone="info">{`${formatMoment(o.migration.startsAt, org.timeZone)}, from ${o.migration.source}`}</Badge> : <Badge>Not booked</Badge>}
                        </li>
                      </ul>
                      {o.checklist.length ? (
                        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                          {o.checklist.map((i) => (
                            <li key={i.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="text-ink">{i.title}</span>
                                <span className="text-caption text-ink-muted">
                                  {i.who === "customer" ? "The customer" : "Our team"}
                                  {i.doneAt ? `, done by ${i.doneBy} ${formatMoment(i.doneAt, org.timeZone)}` : ""}
                                </span>
                              </span>
                              {i.who === "staff" && edit ? <StaffTick organisationId={org.id} onboardingId={o.id} itemKey={i.key} done={Boolean(i.doneAt)} /> : i.doneAt ? <Badge tone="positive">Done</Badge> : <Badge>Waiting</Badge>}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {edit ? (
                        <>
                          <OnboardingForm organisationId={org.id} tenantId={t.id} current={{ kind: o.kind, verificationValue: o.records.find((r) => r.key === "verify")?.value ?? null, partnerInviteUrl: o.partnerInviteUrl }} />
                          <FinishOnboardingButton organisationId={org.id} onboardingId={o.id} />
                        </>
                      ) : null}
                    </CardBody>
                  ) : edit ? (
                    <CardBody>
                      <OnboardingForm organisationId={org.id} tenantId={t.id} current={null} />
                    </CardBody>
                  ) : null}
                </Card>
              );
            })()}
            <div className="grid items-start gap-6 xl:grid-cols-2 [&>*]:min-w-0">
              <Card aria-labelledby={`lic-${t.id}`}>
                <CardHeader id={`lic-${t.id}`} title="Licences" />
                {t.licences.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-callout">
                      <thead className="text-ink-muted">
                        <tr className="border-b border-border">
                          <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Licence</th>
                          <th scope="col" className="px-3 py-3 text-right font-semibold">Bought</th>
                          <th scope="col" className="px-3 py-3 text-right font-semibold">In use</th>
                          <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">Unused</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {t.licences.map((l) => (
                          <tr key={l.id}>
                            <th scope="row" className="px-5 py-3 font-normal sm:px-6">
                              <span className="block font-semibold text-ink">{l.name}</span>
                              <span className="block text-caption text-ink-muted">{l.sku}</span>
                            </th>
                            <td className="px-3 py-3 text-right tabular-nums">{l.purchased}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{l.assigned}</td>
                            <td className="px-5 py-3 text-right sm:px-6">{l.unused ? <Badge tone="warning">{l.unused}</Badge> : <span className="tabular-nums">0</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <CardBody>
                    <p className="text-ink-muted">No licences recorded.</p>
                  </CardBody>
                )}
                {edit ? (
                  <CardBody className="border-t border-border">
                    <RecordLicenceForm organisationId={org.id} tenantId={t.id} />
                  </CardBody>
                ) : null}
              </Card>

              <Card aria-labelledby={`ppl-${t.id}`}>
                <CardHeader id={`ppl-${t.id}`} title={`People (${t.users.filter((u) => u.enabled).length})`} />
                <ul className="divide-y divide-border">
                  {t.pendingUsers.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 px-5 py-3 sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-ink">{p.name}</span>
                        <span className="truncate text-callout text-ink-muted">{p.email}</span>
                      </span>
                      <Badge tone="info">{WAITING.ADD_USER}</Badge>
                    </li>
                  ))}
                  {t.users.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center gap-2 px-5 py-3 sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-ink">{u.name}</span>
                        <span className="truncate text-callout text-ink-muted">{u.email}</span>
                      </span>
                      {!u.enabled ? <Badge>Removed</Badge> : null}
                      {u.licences.map((l) => (
                        <Badge key={l.id}>{l.name}</Badge>
                      ))}
                      {u.pending.map((p) => (
                        <Badge key={p.id} tone="info">
                          {WAITING[p.kind]}
                        </Badge>
                      ))}
                    </li>
                  ))}
                </ul>
                {edit ? (
                  <CardBody className="border-t border-border">
                    <RecordUserForm organisationId={org.id} tenantId={t.id} licences={t.licences.map((l) => ({ id: l.id, name: l.name }))} />
                  </CardBody>
                ) : null}
              </Card>
            </div>
          </section>
        ))}

        {edit && missing.length ? (
          <Card aria-labelledby="link-title">
            <CardHeader id="link-title" title="Link a tenant" description="Once the customer's Microsoft 365 or Google Workspace is set up or brought across." />
            <CardBody>
              <LinkTenantForm organisationId={org.id} vendors={missing} />
            </CardBody>
          </Card>
        ) : null}
        {!tenants.length && !edit ? <p className="text-ink-muted">No tenant linked.</p> : null}
      </div>
    </>
  );
}
