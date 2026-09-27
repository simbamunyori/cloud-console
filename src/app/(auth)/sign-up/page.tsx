import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { currentSession } from "@/server/auth/next";
import { env } from "@/server/env";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Open an account" };

export default async function SignUpPage() {
  const session = await currentSession();
  if (session?.stage === "ACTIVE") redirect("/app");
  return (
    <AuthShell>
      <SignUpForm consoleName={env().CONSOLE_NAME} />
    </AuthShell>
  );
}
