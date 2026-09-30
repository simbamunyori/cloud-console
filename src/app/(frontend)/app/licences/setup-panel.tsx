import { CircleCheck, CircleDashed, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatMoment, toDateOnly } from "@/lib/dates";
import { earliestMove, MIGRATION_SOURCES, type OnboardingView } from "@/server/licences/onboarding";
import { BookMigrationForm, ChecklistToggle, CheckDnsButton } from "./setup-forms";

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 px-5 py-5 sm:px-6">
      <span className={done ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive" : "flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-callout font-semibold text-link"}>
        {done ? <CircleCheck aria-hidden className="size-5" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h3 className="text-headline text-ink">
          {title}
          {done ? <span className="sr-only"> (done)</span> : null}
        </h3>
        {children}
      </div>
    </li>
  );
}

/**
 * Getting a tenant ready, as numbered steps: the checklist for a transfer,
 * the DNS records with a check button, and the email move booking.
 */
export function SetupPanel({ o, manage, timeZone }: { o: OnboardingView; manage: boolean; timeZone: string }) {
  const now = o.records.filter((r) => r.when === "now");
  const later = o.records.filter((r) => r.when === "moving-day");
  let n = 0;
  return (
    <Card aria-labelledby={`setup-${o.id}`}>
      <CardHeader
        id={`setup-${o.id}`}
        title={o.kind === "TRANSFER" ? `Bringing your ${o.vendorLabel} across` : `Setting up ${o.vendorLabel}`}
        description={`For ${o.domain}. We finish this with you; each step shows here as it's done.`}
      />
      <ol className="divide-y divide-border">
        {o.kind === "TRANSFER" ? (
          <Step n={++n} title="Work through the move with us" done={o.checklist.every((i) => i.doneAt)}>
            <ul className="flex flex-col gap-3">
              {o.checklist.map((i) => (
                <li key={i.key} className="flex flex-col gap-2 rounded-md border border-border p-4 sm:flex-row sm:items-start">
                  {i.doneAt ? <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-positive" /> : <CircleDashed aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-semibold text-ink">{i.title}</span>
                    <span className="text-callout text-ink-muted">{i.detail}</span>
                    {i.key === "accept-invite" && !i.doneAt ? (
                      o.partnerInviteUrl ? (
                        <a href={o.partnerInviteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-callout font-semibold text-link hover:underline">
                          Open the invitation <ExternalLink aria-hidden className="size-4" />
                        </a>
                      ) : (
                        <span className="text-callout text-ink-muted">We&apos;ll put the invitation link here shortly.</span>
                      )
                    ) : null}
                    {i.doneAt ? (
                      <span className="text-caption text-ink-muted">
                        Done by {i.doneBy}, {formatMoment(i.doneAt, timeZone)}
                      </span>
                    ) : null}
                  </div>
                  {i.who === "customer" && manage ? <ChecklistToggle onboardingId={o.id} itemKey={i.key} done={Boolean(i.doneAt)} label={i.title} /> : i.who === "staff" && !i.doneAt ? <Badge>Our team</Badge> : null}
                </li>
              ))}
            </ul>
          </Step>
        ) : null}

        <Step n={++n} title="Add these DNS records" done={Boolean(o.domainVerifiedAt)}>
          <p className="text-callout text-ink-muted">
            Add them where your domain is managed, or send them to whoever looks after it.{" "}
            {now.length ? "The first proves the domain is yours." : "We'll add the record that proves the domain is yours here shortly."} The others move your email, so add them on moving day.
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-left text-callout">
              <thead className="text-ink-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-2 font-semibold">Type</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Name</th>
                  <th scope="col" className="px-4 py-2 font-semibold">Value</th>
                  <th scope="col" className="px-4 py-2 font-semibold">When</th>
                  <th scope="col" className="px-4 py-2 font-semibold">
                    <span className="sr-only">Found</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...now, ...later].map((r) => (
                  <tr key={r.key}>
                    <td className="px-4 py-3 font-semibold text-ink">{r.type}</td>
                    <td className="px-4 py-3 text-ink">{r.host}</td>
                    <td className="px-4 py-3">
                      <code className="break-all text-ink">
                        {r.priority !== undefined ? `${r.priority} ` : ""}
                        {r.value}
                      </code>
                      <span className="block text-caption text-ink-muted">{r.purpose}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{r.when === "now" ? "Now" : "Moving day"}</td>
                    <td className="px-4 py-3">{r.found === null ? null : r.found ? <Badge tone="positive">Found</Badge> : <Badge tone={r.when === "now" ? "warning" : "neutral"}>Not yet</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {o.dnsCheckedAt ? <p className="text-caption text-ink-muted">Last checked {formatMoment(o.dnsCheckedAt, timeZone)}</p> : null}
          {manage ? <CheckDnsButton onboardingId={o.id} /> : null}
        </Step>

        <Step n={++n} title="Book the day your email moves" done={Boolean(o.migration)}>
          {o.migration ? (
            <p className="text-ink">
              Starting {formatMoment(o.migration.startsAt, timeZone)}, from {o.migration.source}. We copy your mail in the background first, so the switch takes minutes.
            </p>
          ) : (
            <p className="text-callout text-ink-muted">Pick a time when few people are sending email. We copy everything across first, so on the day nobody loses a message.</p>
          )}
          {manage ? <BookMigrationForm onboardingId={o.id} sources={MIGRATION_SOURCES} earliest={toDateOnly(earliestMove(new Date()))} booked={Boolean(o.migration)} /> : null}
        </Step>
      </ol>
    </Card>
  );
}
