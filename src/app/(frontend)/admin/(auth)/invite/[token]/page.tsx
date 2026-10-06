import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { company, DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { authDeps } from "@/server/auth/next";
import { staffPasswordAllowed } from "@/server/auth/sign-in-options";
import { STAFF_ROLE_LABEL } from "@/server/staff/access";
import { lookupStaffInvitation } from "@/server/staff/invitations";
import { STAFF_POINTS } from "../../points";
import { AcceptStaffInviteForm } from "./invite-form";

export const metadata: Metadata = {
  title: "Set up your staff account",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function StaffInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await params).token);
  const found = await lookupStaffInvitation(authDeps(), token);

  if (found.state !== "VALID") {
    const inviter = found.state === "INVALID" ? "" : found.invitation.invitedBy.name.split(" ")[0];
    const text =
      found.state === "ACCEPTED"
        ? "This invitation has already been used. Sign in to continue."
        : found.state === "EXPIRED"
          ? `This invitation expired. Ask ${inviter} to send it again.`
          : found.state === "REVOKED"
            ? `This invitation was withdrawn. Ask ${inviter} if you still need access.`
            : found.state === "TAKEN"
              ? `${found.invitation.email} already has an account, so a staff account can't be made with it. Ask ${inviter} to invite a different address.`
              : "This link doesn't work. It may be an older invitation that was sent again, or it was cut short when copied. Use the newest email.";
    return (
      <AuthShell title={`${company.name} staff`} points={STAFF_POINTS}>
        <div className="flex flex-col gap-6">
          <AuthHeading title="This invitation can't be used" />
          <Alert tone="info">{text}</Alert>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link href="/admin/sign-in">Go to staff sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const inv = found.invitation;
  const withPassword = staffPasswordAllowed();
  return (
    <AuthShell title={`${company.name} staff`} points={STAFF_POINTS}>
      <div className="flex flex-col gap-6">
        <AuthHeading eyebrow="Step 1 of 2" title="Set up your staff account">
          {inv.invitedBy.name} invited you as {STAFF_ROLE_LABEL[inv.staffRole]} staff. The invitation is for {inv.email} and works until{" "}
          {formatMoment(inv.expiresAt, DEFAULT_TIME_ZONE)}.
        </AuthHeading>
        <AcceptStaffInviteForm token={token} email={inv.email} withPassword={withPassword} />
      </div>
    </AuthShell>
  );
}
