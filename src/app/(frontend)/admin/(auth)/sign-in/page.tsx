import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lockedMessage, oauthMessage } from "@/app/(frontend)/(auth)/messages";
import { staffSignInAction } from "@/app/(frontend)/(auth)/actions";
import { SignInForm } from "@/app/(frontend)/(auth)/sign-in/sign-in-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { company } from "@/config/app";
import { OrDivider, ProviderButtons } from "@/components/auth/provider-buttons";
import { currentSession } from "@/server/auth/next";
import { enabledProviders, staffPasswordAllowed } from "@/server/auth/sign-in-options";
import { STAFF_POINTS } from "../points";

export const metadata: Metadata = { title: "Staff sign in" };

export default async function StaffSignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await currentSession("STAFF");
  if (session?.stage === "ACTIVE") redirect("/admin");

  const next = typeof params.next === "string" ? params.next : "/admin";
  // Staff sign in with Microsoft from our tenant; passwords stay only as a fallback when allowed.
  const providers = enabledProviders("STAFF");
  const password = staffPasswordAllowed();
  let notice: { tone: "info" | "negative" | "positive"; text: string } | undefined;
  if (typeof params.locked === "string") notice = { tone: "negative", text: lockedMessage(new Date(params.locked)) };
  else if (typeof params.oauth === "string") notice = oauthMessage(params.oauth, "microsoft");
  else if (params.expired) notice = { tone: "info", text: "Your sign-in timed out. Enter your password again." };
  else if (params["signed-out"]) notice = { tone: "positive", text: "You've signed out." };

  return (
    <AuthShell title={`${company.name} staff`} points={STAFF_POINTS}>
      <SignInForm
        consoleName="the staff console"
        action={staffSignInAction}
        signUp={false}
        forgot={false}
        next={next}
        notice={notice}
        password={password}
        others={
          providers.length ? (
            <>
              <ProviderButtons providers={providers} base="/admin" next={next} />
              {password ? <OrDivider>or use your password</OrDivider> : null}
            </>
          ) : null
        }
      />
    </AuthShell>
  );
}
