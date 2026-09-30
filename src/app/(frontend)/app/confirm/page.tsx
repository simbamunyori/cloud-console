import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireActiveSession } from "@/server/auth/next";
import { stepUpFresh } from "@/server/auth/step-up";
import { prisma } from "@/server/db";
import { safeNext } from "../../(auth)/shared";
import { ConfirmForm } from "../../(auth)/confirm-form";

export const metadata: Metadata = { title: "Confirm it's you" };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await requireActiveSession();
  const next = safeNext(typeof params.next === "string" ? params.next : "", "CUSTOMER");
  if (stepUpFresh(session)) redirect(next);
  const hasPasskey = (await prisma.passkey.count({ where: { userId: session.userId } })) > 0;
  return (
    <>
      <PageHeader
        title="Confirm it's you"
        description="Paying, changing your team or licences, reducing services and changing how you sign in need a passkey or authenticator code in the last 15 minutes."
      />
      <Card className="max-w-form p-6">
        <ConfirmForm next={next} hasCode={session.user.totpEnabled} hasPasskey={hasPasskey} />
      </Card>
    </>
  );
}
