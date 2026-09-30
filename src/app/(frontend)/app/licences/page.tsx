import { KeyRound, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { tenantOverview, type LicenceView, type PendingView } from "@/server/licences/licences";
import { MANUAL_CHANGE_HOURS, tenantProvider } from "@/server/licences/provider";
import { can } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { AddPerson, PersonActions } from "./forms";

export const metadata: Metadata = { title: "Users and licences" };

const WAITING: Record<PendingView["kind"], (l: string | null) => string> = {
  ASSIGN: (l) => `Getting ${l}`,
  UNASSIGN: (l) => `Giving back ${l}`,
  ADD_USER: () => "Being added",
  REMOVE_USER: () => "Being removed",
};

function LicenceCard({ l }: { l: LicenceView }) {
  const used = l.purchased ? Math.round((l.assigned / l.purchased) * 100) : 0;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="font-semibold text-ink">{l.name}</span>
        {l.unused > 0 ? <Badge tone="warning">{l.unused} unused</Badge> : <Badge tone="positive">All in use</Badge>}
      </div>
      <p className="text-callout text-ink-muted">
        <span className="text-title-2 text-ink tabular-nums">{l.assigned}</span> of {l.purchased} in use
      </p>
      <div role="progressbar" aria-label={`${l.name} in use`} aria-valuemin={0} aria-valuemax={l.purchased} aria-valuenow={l.assigned} className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", l.unused > 0 ? "bg-warning" : "bg-positive")} style={{ width: `${used}%` }} />
      </div>
    </Card>
  );
}

export default async function LicencesPage() {
  const { db, actor, organisation } = await requireMember();
  const tenants = await tenantOverview(db);
  const manage = can(actor, "manageLicences");
  const provider = tenantProvider();

  if (!tenants.length) {
    return (
      <>
        <PageHeader title="Users and licences" description="Everyone in your Microsoft 365 or Google Workspace, and which licences they hold." />
        <Card>
          <CardBody className="flex flex-col items-start gap-4 py-10">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-link">
              <KeyRound aria-hidden className="size-6" />
            </span>
            <div className="flex max-w-2xl flex-col gap-1">
              <h2 className="text-title-2 text-ink">Nothing linked yet</h2>
              <p className="text-ink-muted">
                Once we set up Microsoft 365 or Google Workspace for you, or bring the one you already have across, everyone in it and their licences show here. Unused licences are flagged so you stop paying for them.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/app/marketplace">Browse the marketplace</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/app/support/new">Ask us to bring yours across</Link>
              </Button>
            </div>
          </CardBody>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Users and licences" description="Everyone in your Microsoft 365 or Google Workspace, and which licences they hold." />
      <div className="flex flex-col gap-10">
        {!provider.automatic && manage ? (
          <Alert tone="info">Our team makes each change for you, usually within {MANUAL_CHANGE_HOURS} working hours. It shows here as waiting until it&apos;s done.</Alert>
        ) : null}
        {tenants.map((t) => {
          const active = t.users.filter((u) => u.enabled);
          const removed = t.users.filter((u) => !u.enabled);
          const unused = t.licences.reduce((n, l) => n + l.unused, 0);
          const options = t.licences.map((l) => ({ id: l.id, name: l.name, free: l.free }));
          return (
            <section key={t.id} aria-labelledby={`tenant-${t.id}`} className="flex flex-col gap-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 id={`tenant-${t.id}`} className="text-title-2 text-ink">
                    {t.vendorLabel}
                  </h2>
                  <p className="text-callout text-ink-muted">
                    {t.primaryDomain}
                    {t.lastSyncedAt ? `, checked ${formatMoment(t.lastSyncedAt, organisation.timeZone)}` : ""}
                  </p>
                </div>
              </div>

              {unused > 0 ? (
                <div className="flex items-start gap-3 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-callout">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  <p className="text-ink">
                    {unused === 1 ? "1 licence is" : `${unused} licences are`} paid for but held by no one. Give {unused === 1 ? "it" : "them"} to someone, or{" "}
                    <Link href="/app/services" className="text-link underline underline-offset-2">
                      lower the number in Services
                    </Link>{" "}
                    so you stop paying for {unused === 1 ? "it" : "them"}.
                  </p>
                </div>
              ) : null}

              {t.licences.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-6 2xl:grid-cols-4">
                  {t.licences.map((l) => (
                    <LicenceCard key={l.id} l={l} />
                  ))}
                </div>
              ) : null}

              <Card aria-labelledby={`people-${t.id}`}>
                <CardHeader id={`people-${t.id}`} title={`People (${active.length})`} action={manage ? <AddPerson tenantId={t.id} domain={t.primaryDomain} licences={options} /> : undefined} />
                <ul className="divide-y divide-border">
                  {t.pendingUsers.map((p) => (
                    <li key={p.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold text-ink">{p.name}</span>
                        <span className="truncate text-callout text-ink-muted">{p.email}</span>
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {p.licenceName ? <Badge>{p.licenceName}</Badge> : null}
                        <Badge tone="info">Being added</Badge>
                      </div>
                    </li>
                  ))}
                  {active.map((u) => (
                    <li key={u.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold text-ink">{u.name}</span>
                        <span className="truncate text-callout text-ink-muted">{u.email}</span>
                        <span className="text-caption text-ink-muted">{u.lastSignInAt ? `Last signed in ${formatMoment(u.lastSignInAt, organisation.timeZone)}` : "No sign-in seen"}</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {u.licences.length ? u.licences.map((l) => <Badge key={l.id}>{l.name}</Badge>) : <Badge tone="warning">No licence</Badge>}
                        {u.pending.map((p) => (
                          <Badge key={p.id} tone="info">
                            {WAITING[p.kind](p.licenceName)}
                          </Badge>
                        ))}
                        {manage && !u.pending.length ? <PersonActions tenantUserId={u.id} name={u.name} held={u.licences.map((l) => l.id)} licences={options} /> : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {removed.length ? (
                  <details className="border-t border-border px-5 py-3 sm:px-6">
                    <summary className="cursor-pointer text-callout font-semibold text-ink-muted">Removed ({removed.length})</summary>
                    <ul className="mt-2 flex flex-col gap-1 text-callout text-ink-muted">
                      {removed.map((u) => (
                        <li key={u.id}>
                          {u.name}, {u.email}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Card>
            </section>
          );
        })}
      </div>
    </>
  );
}
