import { Download, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { prisma } from "@/server/db";
import { can } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { monthLabel } from "@/server/security/reports";
import { HEALTH_LABEL, INCIDENT_STATUS_LABEL, SEVERITY_LABEL, SEVERITY_TONE, TENANT_STATUS_LABEL } from "@/server/soc/labels";
import { customerSecurity, managedSecurityOn } from "@/server/soc/soc";

export const metadata: Metadata = { title: "Managed security" };

const HEALTH_TONE = { HEALTHY: "positive", AT_RISK: "warning", OFFLINE: "neutral", UNPROTECTED: "negative" } as const satisfies Record<string, BadgeTone>;

/** Managed security and the 24/7 SOC (docs/STRATEGY_ROLLOUT.md, U5), under our name only. */
export default async function ManagedSecurityPage() {
  const { db, actor, organisation } = await requireMember();
  if (!(await managedSecurityOn(prisma))) notFound();
  const { tenant, devices, incidents, reports } = await customerSecurity(db);
  const tz = organisation.timeZone;
  const open = incidents.filter((i) => i.status !== "RESOLVED");
  const covered = devices.filter((d) => d.health !== "UNPROTECTED").length;

  if (!tenant || tenant.status === "REMOVED") {
    return (
      <>
        <PageHeader eyebrow="Security" title="Managed security" />
        <Card>
          <CardBody className="flex flex-col items-start gap-4 py-10">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-link">
              <ShieldCheck aria-hidden className="size-6" />
            </span>
            <h2 className="text-headline text-ink">Security software on every computer, watched around the clock</h2>
            <p className="max-w-prose text-ink-muted">Our security operations centre watches every protected computer day and night, isolates one that is infected and tells you what we did.</p>
            {can(actor, "order") ? (
              <Button asChild>
                <Link href="/app/marketplace/managed-detection-response">Add managed security</Link>
              </Button>
            ) : null}
          </CardBody>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Security" title="Managed security" description="Your computers, watched by our security operations centre 24 hours a day." actions={<Badge tone={tenant.status === "ACTIVE" ? "positive" : "info"}>{TENANT_STATUS_LABEL[tenant.status]}</Badge>} />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <span className="text-callout text-ink-muted">Computers protected</span>
            <p className="mt-1 text-title-2 text-ink tabular-nums">{devices.length ? `${covered} of ${devices.length}` : "None yet"}</p>
          </Card>
          <Card className="p-5">
            <span className="text-callout text-ink-muted">Open incidents</span>
            <p className={`mt-1 text-title-2 tabular-nums ${open.length ? "text-warning" : "text-ink"}`}>{open.length}</p>
          </Card>
          <Card className="p-5">
            <span className="text-callout text-ink-muted">Watching since</span>
            <p className="mt-1 text-title-2 text-ink">{formatMoment(tenant.createdAt, tz).split(",")[0]}</p>
          </Card>
        </div>

        {tenant.enrolmentLink ? (
          <Card aria-labelledby="install-title">
            <CardHeader id="install-title" title="Protect a computer" description={tenant.enrolmentNote ?? "Open this link on each computer to install our security agent. It joins your account on its own."} />
            <CardBody>
              <Button asChild>
                <a href={tenant.enrolmentLink} rel="noopener noreferrer">
                  <Download aria-hidden /> Get the installer
                </a>
              </Button>
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardBody>
              <p className="text-ink-muted">We&apos;re setting up your account. The installer link appears here, and we email you, once it is ready.</p>
            </CardBody>
          </Card>
        )}

        <Card aria-labelledby="incidents-title">
          <CardHeader id="incidents-title" title="Incidents" description="Anything our security operations centre found, and what we're doing about it." />
          {incidents.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">Nothing found. We&apos;ll email you if we find anything.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {incidents.map((i) => (
                <li key={i.reference}>
                  <Link href={`/app/security/managed/incidents/${i.reference}`} className="flex flex-col gap-1 px-5 py-4 hover:bg-surface-2 sm:px-6">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{i.title}</span>
                      <Badge tone={SEVERITY_TONE[i.severity]}>{SEVERITY_LABEL[i.severity]}</Badge>
                      <Badge tone={i.status === "RESOLVED" ? "positive" : "info"}>{INCIDENT_STATUS_LABEL[i.status]}</Badge>
                    </span>
                    <span className="text-callout text-ink-muted">
                      {i.reference}, {formatMoment(i.createdAt, tz)}
                      {i.deviceName ? `, ${i.deviceName}` : ""}. {i.ourAction ? `What we're doing: ${i.ourAction}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
          <Card aria-labelledby="devices-title">
            <CardHeader id="devices-title" title="Computers" />
            {devices.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">No computers yet. Install the agent on each one to protect it.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {devices.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-ink">{d.name}</span>
                      <span className="text-callout text-ink-muted">
                        {[d.os, d.lastSeenAt ? `seen ${formatMoment(d.lastSeenAt, tz)}` : null].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    <Badge tone={HEALTH_TONE[d.health]}>{HEALTH_LABEL[d.health]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card aria-labelledby="reports-title">
            <CardHeader id="reports-title" title="Monthly reports" />
            {reports.length === 0 ? (
              <CardBody>
                <p className="text-ink-muted">Your first report arrives after your first full month.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-border">
                {reports.map((r) => (
                  <li key={r.month} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink">
                        {monthLabel(r.month)}: {r.title}
                      </span>
                      {r.url ? (
                        <a href={r.url} rel="noopener noreferrer" className="text-callout font-semibold text-link hover:underline">
                          Open
                        </a>
                      ) : null}
                    </span>
                    {r.summary ? <span className="text-callout text-ink-muted">{r.summary}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
