import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { staffConfirmCodeAction } from "@/app/(frontend)/(auth)/actions";
import { ConfirmForm } from "@/app/(frontend)/(auth)/confirm-form";
import { safeNext } from "@/app/(frontend)/(auth)/shared";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireActiveStaffSession } from "@/server/auth/next";
import { stepUpFresh } from "@/server/auth/step-up";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Confirm it's you" };

export default async function StaffConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await requireActiveStaffSession();
  const next = safeNext(typeof params.next === "string" ? params.next : "", "STAFF");
  if (stepUpFresh(session)) redirect(next);
  const hasPasskey = (await prisma.passkey.count({ where: { userId: session.userId } })) > 0;
  return (
    <>
      <PageHeader title="Confirm it's you" description="Changing website editor roles or how you sign in needs a passkey or authenticator code in the last 15 minutes." />
      <Card className="max-w-form p-6">
        <ConfirmForm next={next} hasCode={session.user.totpEnabled} hasPasskey={hasPasskey} audience="STAFF" action={staffConfirmCodeAction} />
      </Card>
    </>
  );
}
