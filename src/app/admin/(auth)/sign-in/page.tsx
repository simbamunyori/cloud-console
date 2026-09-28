import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lockedMessage } from "@/app/(auth)/messages";
import { staffSignInAction } from "@/app/(auth)/actions";
import { SignInForm } from "@/app/(auth)/sign-in/sign-in-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { company } from "@/config/app";
import { currentSession } from "@/server/auth/next";
import { STAFF_POINTS } from "../points";

export const metadata: Metadata = { title: "Staff sign in" };

export default async function StaffSignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await currentSession("STAFF");
  if (session?.stage === "ACTIVE") redirect("/admin");

  let notice: { tone: "info" | "negative" | "positive"; text: string } | undefined;
  if (typeof params.locked === "string") notice = { tone: "negative", text: lockedMessage(new Date(params.locked)) };
  else if (params.expired) notice = { tone: "info", text: "Your sign-in timed out. Enter your password again." };
  else if (params["signed-out"]) notice = { tone: "positive", text: "You've signed out." };

  return (
    <AuthShell title={`${company.name} staff`} points={STAFF_POINTS}>
      <SignInForm consoleName="the staff console" action={staffSignInAction} signUp={false} forgot={false} next={typeof params.next === "string" ? params.next : "/admin"} notice={notice} />
    </AuthShell>
  );
}
