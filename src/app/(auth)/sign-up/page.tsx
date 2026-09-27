import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { currentSession } from "@/server/auth/next";
import { env } from "@/server/env";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Open an account" };

const POINTS: [string, string][] = [
  ["One account for every service", "Microsoft 365, Google Workspace, servers, hosting and domains."],
  ["One monthly invoice in pula", "Every line explained, with what changed since last month."],
  ["Two-step login for everyone", "A code from your phone on every sign-in, for every user."],
];

export default async function SignUpPage() {
  const session = await currentSession();
  if (session?.stage === "ACTIVE") redirect("/app");
  return (
    <AuthShell title="Your cloud, in one place." points={POINTS}>
      <SignUpForm consoleName={env().CONSOLE_NAME} />
    </AuthShell>
  );
}
