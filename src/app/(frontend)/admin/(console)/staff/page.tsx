import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { STAFF_ROLE_DESCRIPTION, STAFF_ROLE_LABEL, STAFF_ROLES, WEBSITE_ROLE_LABEL } from "@/server/staff/access";
import { openStaffInvitations } from "@/server/staff/invitations";
import { staffList } from "@/server/staff/website-roles";
import { InviteStaffForm, StaffActions, StaffInvitationActions, WebsiteRoleForm } from "./forms";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const { staff } = await requireStaffCan("manageStaff");
  const [people, invitations] = await Promise.all([staffList(prisma, staff), openStaffInvitations(prisma, staff)]);
  const active = people.filter((p) => !p.deactivatedAt);
  const deactivated = people.filter((p) => p.deactivatedAt);
  const roles = STAFF_ROLES.map((r) => ({ value: r, label: STAFF_ROLE_LABEL[r], description: STAFF_ROLE_DESCRIPTION[r] }));

  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone who can sign in to the staff console, what they do, and who can change the website. Editors save drafts; Publishers also publish, schedule, restore earlier versions and approve legal text. Admins can always publish."
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="invite-title">
          <CardHeader
            id="invite-title"
            title="Invite a colleague"
            description="They'll get an email with a link that works for 7 days, choose their own name and password, and set up an authenticator app. You'll get an email when they've finished."
          />
          <CardBody>
            <InviteStaffForm roles={roles} />
          </CardBody>
        </Card>

        {invitations.length ? (
          <Card aria-labelledby="invites-title">
            <CardHeader id="invites-title" title="Invitations waiting" />
            <ul className="divide-y divide-border">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold break-words text-ink">{i.email}</span>
                    <span className="text-callout text-ink-muted">
                      {STAFF_ROLE_LABEL[i.staffRole]}
                      {i.staffRole !== "ADMIN" && i.websiteRole ? `, website ${WEBSITE_ROLE_LABEL[i.websiteRole]}` : ""}. Invited by {i.invitedBy}.{" "}
                      {i.expired ? "The link has expired." : `Link works until ${formatMoment(i.expiresAt, DEFAULT_TIME_ZONE)}.`}
                    </span>
                  </div>
                  <StaffInvitationActions invitationId={i.id} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card aria-labelledby="staff-title">
          <CardHeader id="staff-title" title={`People (${active.length})`} />
          <ul className="divide-y divide-border">
            {active.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:px-6">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-ink">
                    {p.name}
                    {p.id === staff.userId ? <span className="font-normal text-ink-muted"> (you)</span> : null}
                  </span>
                  <span className="text-callout break-words text-ink-muted">{p.email}</span>
                  <span className="text-caption text-ink-muted">
                    {p.lastLoginAt ? `Last signed in ${formatMoment(p.lastLoginAt, DEFAULT_TIME_ZONE)}` : "Hasn't signed in yet"}
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {p.twoStepOn ? null : <Badge tone="warning">Still setting up</Badge>}
                  <Badge tone="info">{p.staffRole ? STAFF_ROLE_LABEL[p.staffRole] : "No staff role"}</Badge>
                  {p.staffRole === "ADMIN" ? (
                    <Badge tone="neutral">{WEBSITE_ROLE_LABEL.PUBLISHER}, as an Admin</Badge>
                  ) : (
                    <WebsiteRoleForm userId={p.id} name={p.name} current={p.websiteRole ?? "NONE"} />
                  )}
                  {p.id !== staff.userId && p.staffRole ? <StaffActions userId={p.id} name={p.name} role={p.staffRole} deactivated={false} roles={roles} /> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {deactivated.length ? (
          <Card aria-labelledby="deactivated-title">
            <CardHeader id="deactivated-title" title={`Deactivated (${deactivated.length})`} description="They can't sign in. Their past work stays in the audit log." />
            <ul className="divide-y divide-border">
              {deactivated.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold text-ink">{p.name}</span>
                    <span className="text-callout break-words text-ink-muted">
                      {p.email} · Deactivated {formatMoment(p.deactivatedAt!, DEFAULT_TIME_ZONE)}
                    </span>
                  </span>
                  {p.staffRole ? <StaffActions userId={p.id} name={p.name} role={p.staffRole} deactivated roles={roles} /> : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card aria-labelledby="roles-title">
          <CardHeader id="roles-title" title="What each staff role can do" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              {roles.map((r) => (
                <div key={r.value} className="flex flex-col gap-0.5">
                  <dt className="font-semibold text-ink">{r.label}</dt>
                  <dd className="text-callout text-ink-muted">{r.description}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
