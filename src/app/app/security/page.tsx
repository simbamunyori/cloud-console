import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { company } from "@/config/app";
import { describeDevice } from "@/server/email/templates";
import { prisma } from "@/server/db";
import { can } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { auditLog, signInHistory } from "@/server/org/security";
import { securityCards } from "@/server/security/cards";
import { BackupCodesForm, SignOutOthersForm } from "./security-forms";

export const metadata: Metadata = { title: "Security" };

const OUTCOME: Record<string, { label: string; tone: "positive" | "negative" | "warning" }> = {
  SUCCEEDED: { label: "Signed in", tone: "positive" },
  WRONG_PASSWORD: { label: "Wrong password", tone: "negative" },
  WRONG_CODE: { label: "Wrong code", tone: "negative" },
  LOCKED: { label: "Paused after tries", tone: "warning" },
};

const ACTOR: Record<string, string> = { CUSTOMER: "", STAFF: `${company.name} staff`, SYSTEM: "Automatic", ASSISTANT: "Assistant" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { db, actor, organisation, session } = await requireMember();
  const everyoneAllowed = can(actor, "viewSecurity");
  const tz = organisation.timeZone;
  const [history, cards, events] = await Promise.all([
    signInHistory(prisma, db, actor, { everyone: params.who === "team" }),
    securityCards({ prisma, db, actor, user: session.user, timeZone: tz }),
    auditLog(db, { take: 50 }),
  ]);

  return (
    <>
      <PageHeader title="Security" description="How your account is protected, who signed in, and everything done on your account, including by our staff." />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Card key={c.key} className="p-5">
              <span className="text-callout text-ink-muted">{c.label}</span>
              <p className={`mt-1 text-title-2 tabular-nums ${c.tone === "warning" ? "text-warning" : c.tone === "negative" ? "text-negative" : "text-ink"}`}>{c.value}</p>
              <p className="text-callout text-ink-muted">{c.detail}</p>
            </Card>
          ))}
        </div>

        <Card aria-labelledby="signins-title">
          <CardHeader
            id="signins-title"
            title="Sign-in history"
            description={history.everyone ? "Everyone in your team, newest first." : "Your sign-ins, newest first."}
            action={
              everyoneAllowed ? (
                <div className="flex gap-1 rounded-md bg-surface-2 p-1 text-callout" role="group" aria-label="Whose sign-ins">
                  <Link href="/app/security" aria-current={!history.everyone ? "true" : undefined} className="rounded-sm px-3 py-1.5 aria-[current=true]:bg-surface-1 aria-[current=true]:font-semibold aria-[current=true]:text-ink">
                    Mine
                  </Link>
                  <Link href="/app/security?who=team" aria-current={history.everyone ? "true" : undefined} className="rounded-sm px-3 py-1.5 aria-[current=true]:bg-surface-1 aria-[current=true]:font-semibold aria-[current=true]:text-ink">
                    Everyone
                  </Link>
                </div>
              ) : undefined
            }
          />
          {history.events.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No sign-ins yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {history.events.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                  <span className="text-callout text-ink tabular-nums sm:w-48">{formatMoment(e.createdAt, tz)}</span>
                  <span className="flex-1 text-callout text-ink-muted">
                    {history.everyone ? <span className="font-semibold text-ink">{e.user.name}. </span> : null}
                    {describeDevice(e.userAgent)}
                    {e.ipAddress ? `, ${e.ipAddress}` : ""}
                    {e.method ? `, with ${e.method}` : ""}
                  </span>
                  <Badge tone={OUTCOME[e.outcome].tone}>{OUTCOME[e.outcome].label}</Badge>
                </li>
              ))}
            </ul>
          )}
          <CardBody className="border-t border-border">
            <SignOutOthersForm />
          </CardBody>
        </Card>

        <Card aria-labelledby="codes-title">
          <CardHeader id="codes-title" title="Backup codes" description="Make a new set if you've used most of them or think someone else has seen them. The old set stops working." />
          <CardBody>
            <BackupCodesForm />
          </CardBody>
        </Card>

        <Card aria-labelledby="audit-title">
          <CardHeader
            id="audit-title"
            title="Activity on your account"
            description="Every change made to your account, by your team or by our staff. Nothing here can be edited or removed."
          />
          {events.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">Nothing yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:gap-4 sm:px-6">
                  <span className="text-callout text-ink-muted tabular-nums sm:w-48 sm:shrink-0">{formatMoment(e.createdAt, tz)}</span>
                  <span className="flex-1 text-callout text-ink">
                    <span className="font-semibold">{e.actorLabel}</span>
                    {ACTOR[e.actorKind] ? <span className="text-ink-muted"> ({ACTOR[e.actorKind]})</span> : null}. {e.summary}
                  </span>
                  {e.actorKind === "STAFF" ? <Badge tone="info">Staff</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
