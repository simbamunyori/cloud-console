import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { currentSession } from "@/server/auth/next";
import { lockedMessage } from "../messages";
import { env } from "@/server/env";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await currentSession();
  if (session?.stage === "ACTIVE") redirect("/app");

  let notice: { tone: "info" | "negative" | "positive"; text: string } | undefined;
  if (typeof params.locked === "string") notice = { tone: "negative", text: lockedMessage(new Date(params.locked)) };
  else if (params.expired) notice = { tone: "info", text: "Your sign-in timed out. Enter your password again." };
  else if (params["signed-out"]) notice = { tone: "positive", text: "You've signed out." };

  return (
    <AuthShell>
      <SignInForm consoleName={env().CONSOLE_NAME} next={typeof params.next === "string" ? params.next : "/app"} notice={notice} />
    </AuthShell>
  );
}
