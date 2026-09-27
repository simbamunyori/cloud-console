import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDay, todayIn } from "@/lib/dates";
import { authDeps, currentSession } from "@/server/auth/next";
import { lookupInvitation } from "@/server/auth/service";
import { ROLE_LABEL } from "@/server/org/access";
import { AcceptInviteForm, JoinWithAccountForm } from "./invite-forms";

export const metadata: Metadata = {
  title: "Join your team",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const POINTS: [string, string][] = [
  ["One account for every service", "Microsoft 365, Google Workspace, servers, hosting and domains."],
  ["One monthly invoice in pula", "Every line explained, with what changed since last month."],
  ["Two-step login for everyone", "A code from your phone on every sign-in, for every user."],
];

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await currentSession();
  const found = await lookupInvitation(authDeps(), decodeURIComponent(token));

  if (found.state !== "VALID") {
    const text =
      found.state === "ACCEPTED"
        ? "This invitation has already been accepted. Sign in to continue."
        : found.state === "EXPIRED"
          ? `This invitation expired. Ask ${found.invitation.invitedBy.user.name.split(" ")[0]} to send it again.`
          : found.state === "REVOKED"
            ? "This invitation was withdrawn. Ask the person who invited you if you still need access."
            : "This link doesn't work. It may be an older invitation that was sent again, or it was cut short when copied. Use the newest email.";
    return (
      <AuthShell title="Your cloud, in one place." points={POINTS}>
        <div className="flex flex-col gap-6">
          <AuthHeading title="This invitation can't be used" />
          <Alert tone="info">{text}</Alert>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link href="/sign-in">Go to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  const inv = found.invitation;
  const role = ROLE_LABEL[inv.role].toLowerCase();
  const inviter = inv.invitedBy.user.name;
  const signedIn = session?.stage === "ACTIVE" ? session : null;

  return (
    <AuthShell title="Your cloud, in one place." points={POINTS}>
      <div className="flex flex-col gap-6">
        <AuthHeading eyebrow={found.hasAccount ? undefined : "Step 1 of 2"} title={`Join ${inv.organisation.name}`}>
          {inviter} invited you with {role} access. The invitation is for {inv.email} and works until{" "}
          {formatDay(todayIn(inv.organisation.timeZone, inv.expiresAt), true)}.
        </AuthHeading>
        {found.hasAccount ? (
          signedIn ? (
            signedIn.user.email === inv.email ? (
              <JoinWithAccountForm token={decodeURIComponent(token)} organisation={inv.organisation.name} />
            ) : (
              <Alert tone="info">
                You&apos;re signed in as {signedIn.user.email}. Sign out, then open this link again and sign in as {inv.email}.
              </Alert>
            )
          ) : (
            <>
              <Alert tone="info">{inv.email} already has an account. Sign in to accept.</Alert>
              <Button asChild size="lg" className="w-full">
                <Link href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</Link>
              </Button>
            </>
          )
        ) : (
          <AcceptInviteForm token={decodeURIComponent(token)} email={inv.email} />
        )}
      </div>
    </AuthShell>
  );
}
