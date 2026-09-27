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
import { auditLog, recoveryCodesLeft, signInHistory, twoStepCoverage } from "@/server/org/security";
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
  const [history, coverage, codesLeft, events] = await Promise.all([
    signInHistory(prisma, db, actor, { everyone: params.who === "team" }),
    twoStepCoverage(db),
    recoveryCodesLeft(prisma, actor.userId),
    auditLog(db, { take: 50 }),
  ]);
  const tz = organisation.timeZone;

  return (
    <>
      <PageHeader title="Security" description="How your account is protected, who signed in, and everything done on your account, including by our staff." />
      <div className="flex flex-col gap-6">
        {/* Overview cards. Later phases add security score, devices, alerts, Botswana Copy and documents here. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-5">
            <span className="text-callout text-ink-muted">Two-step login</span>
            <p className="mt-1 text-title-2 text-ink tabular-nums">
              {coverage.on} of {coverage.total}
            </p>
            <p className="text-callout text-ink-muted">
              {coverage.on === coverage.total ? "Everyone in your team uses it." : "Some people are still setting it up."}
            </p>
          </Card>
          <Card className="p-5">
            <span className="text-callout text-ink-muted">Your backup codes</span>
            <p className="mt-1 text-title-2 text-ink tabular-nums">{codesLeft} left</p>
            <p className="text-callout text-ink-muted">{codesLeft <= 2 ? "Running low. Make new ones below." : "Each works once if you lose your phone."}</p>
          </Card>
          <Card className="p-5">
            <span className="text-callout text-ink-muted">Two-step login for you</span>
            <p className="mt-1 text-title-2 text-ink">On</p>
            <p className="text-callout text-ink-muted">
              {session.user.totpEnabledAt ? `Since ${formatMoment(session.user.totpEnabledAt, tz)}` : "Required for every account."}
            </p>
          </Card>
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
