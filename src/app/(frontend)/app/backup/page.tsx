import { DatabaseBackup } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment, toDateOnly, todayIn } from "@/lib/dates";
import { customerBackupOn, customerBackups, DESTINATIONS, HEALTH_LABEL, RESTORE_LABEL } from "@/server/backup/backup";
import { prisma } from "@/server/db";
import { can } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { RestoreForm } from "./forms";

export const metadata: Metadata = { title: "Backup" };

const TONE = { PENDING: "info", OK: "positive", WARNING: "warning", FAILED: "negative" } as const satisfies Record<string, BadgeTone>;
const RESTORE_TONE = { REQUESTED: "info", IN_PROGRESS: "info", DONE: "positive", CANCELLED: "neutral" } as const satisfies Record<string, BadgeTone>;

const kept = (days: number) => (days % 365 === 0 ? `${days / 365} ${days === 365 ? "year" : "years"}` : `${days} days`);

/** Off-site backup (docs/STRATEGY_ROLLOUT.md, U3): every backup's status and restores, under our name only. */
export default async function BackupPage() {
  const { db, actor, market } = await requireMember();
  if (!(await customerBackupOn(prisma))) notFound();
  const { protections, restores } = await customerBackups(db);
  const tz = market.timeZone;
  const today = toDateOnly(todayIn(tz));
  const labelOf = new Map(protections.map((p) => [p.id, p.label]));
  const restorable = protections.filter((p) => p.health !== "PENDING");

  return (
    <>
      <PageHeader title="Backup" description="Off-site copies of your email, files and servers, kept by Fourth Generation Technologies, and anything you need back." />
      {protections.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-start gap-4 py-10">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-link">
              <DatabaseBackup aria-hidden className="size-6" />
            </span>
            <h2 className="text-headline text-ink">No backups yet</h2>
            <p className="max-w-prose text-ink-muted">Add backup for Microsoft 365, Google Workspace or a server, and it shows here with its last successful copy and how long copies are kept.</p>
            {can(actor, "order") ? (
              <Button asChild>
                <Link href="/app/marketplace#cat-protection">Add backup</Link>
              </Button>
            ) : null}
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {protections.map((p) => (
              <li key={p.id}>
                <Card className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-ink">{p.label}</span>
                    <Badge tone={TONE[p.health]}>{HEALTH_LABEL[p.health]}</Badge>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-callout">
                    <dt className="text-ink-muted">Last good copy</dt>
                    <dd className="text-ink">{p.lastSuccessAt ? formatMoment(p.lastSuccessAt, tz) : "None yet"}</dd>
                    <dt className="text-ink-muted">Copies kept for</dt>
                    <dd className="text-ink">{p.retentionDays ? kept(p.retentionDays) : "Being set up"}</dd>
                    {p.coverage ? (
                      <>
                        <dt className="text-ink-muted">Covers</dt>
                        <dd className="text-ink">{p.coverage}</dd>
                      </>
                    ) : null}
                  </dl>
                  {p.health === "FAILED" || p.health === "WARNING" ? <p className="text-callout text-ink-muted">Our team has been told and is looking at it.</p> : null}
                </Card>
              </li>
            ))}
          </ul>

          <div className="grid gap-6 xl:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
            <Card aria-labelledby="restores-title">
              <CardHeader id="restores-title" title="Restores" />
              {restores.length === 0 ? (
                <CardBody>
                  <p className="text-ink-muted">You haven&apos;t asked for anything back yet.</p>
                </CardBody>
              ) : (
                <ul className="divide-y divide-border">
                  {restores.map((r) => (
                    <li key={r.id} className="flex flex-col gap-1 px-5 py-4 sm:px-6">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-ink">{r.what}</span>
                        <Badge tone={RESTORE_TONE[r.status]}>{RESTORE_LABEL[r.status]}</Badge>
                      </div>
                      <span className="text-callout text-ink-muted">
                        {labelOf.get(r.protectionId)}, from {toDateOnly(r.fromDay)}, {DESTINATIONS[r.destination as keyof typeof DESTINATIONS]?.toLowerCase() ?? r.destination}. Asked {formatMoment(r.createdAt, tz)}
                        {r.completedAt && r.status === "DONE" ? `, done ${formatMoment(r.completedAt, tz)}` : ""}.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {can(actor, "order") ? (
              <Card aria-labelledby="restore-title">
                <CardHeader id="restore-title" title="Get something back" description={restorable.length ? "From any day we still keep a copy of." : "You can ask once a backup has made its first copy."} />
                {restorable.length ? (
                  <CardBody>
                    <RestoreForm
                      protections={restorable.map((p) => ({ value: p.id, label: p.label }))}
                      destinations={Object.entries(DESTINATIONS).map(([value, label]) => ({ value, label }))}
                      today={today}
                    />
                  </CardBody>
                ) : null}
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
