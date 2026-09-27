import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { currentSession, homeFor } from "@/server/auth/next";
import { env } from "@/server/env";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "Enter your code" };

const POINTS: [string, string][] = [
  ["One account for every service", "Microsoft 365, Google Workspace, servers, hosting and domains."],
  ["One monthly invoice in pula", "Every line explained, with what changed since last month."],
  ["Two-step login for everyone", "A code from your phone on every sign-in, for every user."],
];

export default async function CodePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await currentSession();
  if (session?.stage !== "CODE_PENDING") redirect(session ? homeFor(session) : "/sign-in?expired=1");
  return (
    <AuthShell title="Your cloud, in one place." points={POINTS}>
      <CodeForm consoleName={env().CONSOLE_NAME} email={session.user.email} next={typeof params.next === "string" ? params.next : "/app"} />
    </AuthShell>
  );
}
