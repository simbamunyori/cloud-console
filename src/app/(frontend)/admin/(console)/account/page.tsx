import type { Metadata } from "next";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { PasskeyList } from "@/components/auth/passkey-list";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { signInMethods } from "@/server/auth/methods";
import { requireActiveStaffSession } from "@/server/auth/next";
import { enabledProviders, staffPasswordAllowed } from "@/server/auth/sign-in-options";
import { prisma } from "@/server/db";
import { staffRemovePasskeyAction, staffRenamePasskeyAction } from "./actions";

export const metadata: Metadata = { title: "Your sign-in" };

export default async function StaffAccountPage() {
  const session = await requireActiveStaffSession();
  const methods = await signInMethods(prisma, session.userId, DEFAULT_TIME_ZONE);
  const microsoft = enabledProviders("STAFF").includes("MICROSOFT");
  const linked = methods.linked.get("MICROSOFT");
  const first = microsoft ? `You sign in with your Microsoft account${linked ? ` (${linked})` : ""}${staffPasswordAllowed() ? " or your password" : ""}.` : "You sign in with your email and password.";
  const hasPasskey = methods.passkeys.length > 0;
  const second = session.user.totpEnabled
    ? hasPasskey
      ? "Then a passkey or the code from your authenticator app."
      : "Then the code from your authenticator app."
    : hasPasskey
      ? "Then your passkey."
      : "Then a passkey or authenticator code.";
  return (
    <>
      <PageHeader title="Your sign-in" description={`${first} ${second}`} />
      <Card aria-labelledby="passkeys-title">
        <CardHeader id="passkeys-title" title="Passkeys" description="Use your fingerprint, face or device PIN for the second step instead of a code." />
        <CardBody>
          <PasskeyList passkeys={methods.passkeys} audience="STAFF" removeAction={staffRemovePasskeyAction} renameAction={staffRenamePasskeyAction} />
        </CardBody>
      </Card>
    </>
  );
}
