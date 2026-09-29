import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { can, canAssignRole, ROLE_DESCRIPTION, ROLE_LABEL, ROLES } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { teamOverview } from "@/server/org/members";
import { InvitationActions, InviteForm, MemberActions } from "./team-forms";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { db, actor, organisation } = await requireMember();
  const team = await teamOverview(db);
  const manage = can(actor, "manageTeam");
  const assignable = ROLES.filter((r) => canAssignRole(actor, r)).map((r) => ({ value: r, label: ROLE_LABEL[r], description: ROLE_DESCRIPTION[r] }));

  return (
    <>
      <PageHeader title="Team" description="Everyone who can sign in to manage your organisation, and what each person can do." />
      <div className="flex flex-col gap-6">
        {manage ? (
          <Card aria-labelledby="invite-title">
            <CardHeader id="invite-title" title="Invite someone" description="They'll get an email with a link that works for 7 days." />
            <CardBody>
              <InviteForm roles={assignable} />
            </CardBody>
          </Card>
        ) : null}

        <Card aria-labelledby="members-title">
          <CardHeader id="members-title" title={`People (${team.members.length})`} />
          <ul className="divide-y divide-border">
            {team.members.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-ink">
                    {m.name}
                    {m.userId === actor.userId ? <span className="font-normal text-ink-muted"> (you)</span> : null}
                  </span>
                  <span className="truncate text-callout text-ink-muted">{m.email}</span>
                  <span className="text-caption text-ink-muted">
                    {m.lastSignIn ? `Last signed in ${formatMoment(m.lastSignIn, organisation.timeZone)}` : "Hasn't signed in yet"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {m.twoStepOn ? <Badge tone="positive">Two-step on</Badge> : <Badge tone="warning">Setting up two-step</Badge>}
                  <Badge tone="info">{ROLE_LABEL[m.role]}</Badge>
                  {manage && m.userId !== actor.userId && canAssignRole(actor, m.role) ? (
                    <MemberActions membershipId={m.id} name={m.name} role={m.role} roles={assignable} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {team.invitations.length ? (
          <Card aria-labelledby="invites-title">
            <CardHeader id="invites-title" title="Invitations waiting" />
            <ul className="divide-y divide-border">
              {team.invitations.map((i) => (
                <li key={i.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold text-ink">{i.email}</span>
                    <span className="text-callout text-ink-muted">
                      {ROLE_LABEL[i.role]}. Invited by {i.invitedBy}.{" "}
                      {i.expired ? "The link has expired." : `Link works until ${formatMoment(i.expiresAt, organisation.timeZone)}.`}
                    </span>
                  </div>
                  {manage && canAssignRole(actor, i.role) ? <InvitationActions invitationId={i.id} /> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card aria-labelledby="roles-title">
          <CardHeader id="roles-title" title="What each role can do" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              {ROLES.map((r) => (
                <div key={r} className="flex flex-col gap-0.5">
                  <dt className="font-semibold text-ink">{ROLE_LABEL[r]}</dt>
                  <dd className="text-callout text-ink-muted">{ROLE_DESCRIPTION[r]}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
