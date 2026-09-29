import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authDeps } from "@/server/auth/next";
import { checkPasswordReset } from "@/server/auth/service";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await params).token);
  if ((await checkPasswordReset(authDeps(), token)) !== "VALID") {
    return (
      <AuthShell>
        <div className="flex flex-col gap-6">
          <AuthHeading title="This link can't be used" />
          <Alert tone="info">Reset links work once, for 30 minutes, and asking again cancels older ones. Ask for a new link and use the newest email.</Alert>
          <Button asChild size="lg" className="w-full">
            <Link href="/forgot-password">Ask for a new link</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
