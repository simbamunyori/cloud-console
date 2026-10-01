import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { staffCodeAction } from "@/app/(frontend)/(auth)/actions";
import { CodeForm } from "@/app/(frontend)/(auth)/sign-in/code/code-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { company } from "@/config/app";
import { currentSession, staffHomeFor } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { STAFF_POINTS } from "../../points";

export const metadata: Metadata = { title: "Enter your code" };

export default async function StaffCodePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await currentSession("STAFF");
  if (session?.stage !== "CODE_PENDING") redirect(session ? staffHomeFor(session) : "/admin/sign-in?expired=1");
  const hasPasskey = (await prisma.passkey.count({ where: { userId: session.userId } })) > 0;
  return (
    <AuthShell title={`${company.name} staff`} points={STAFF_POINTS}>
      <CodeForm
        consoleName="the staff console"
        email={session.user.email}
        audience="STAFF"
        hasCode={session.user.totpEnabled}
        hasPasskey={hasPasskey}
        action={staffCodeAction}
        signInPath="/admin/sign-in"
        next={typeof params.next === "string" ? params.next : "/admin"}
      />
    </AuthShell>
  );
}
