import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { currentSession, homeFor } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "Enter your code" };

export default async function CodePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await currentSession();
  if (session?.stage !== "CODE_PENDING") redirect(session ? homeFor(session) : "/sign-in?expired=1");
  const hasPasskey = (await prisma.passkey.count({ where: { userId: session.userId } })) > 0;
  return (
    <AuthShell>
      <CodeForm
        consoleName={env().CONSOLE_NAME}
        email={session.user.email}
        audience="CUSTOMER"
        hasCode={session.user.totpEnabled}
        hasPasskey={hasPasskey}
        next={typeof params.next === "string" ? params.next : "/app"}
      />
    </AuthShell>
  );
}
