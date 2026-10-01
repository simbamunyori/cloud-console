import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasskeyButton } from "@/components/auth/passkey-button";
import { OrDivider, ProviderButtons } from "@/components/auth/provider-buttons";
import { readPending } from "@/server/auth/flow-cookies";
import { currentSession } from "@/server/auth/next";
import { providerName } from "@/server/auth/oauth";
import { enabledProviders } from "@/server/auth/sign-in-options";
import { env } from "@/server/env";
import { lockedMessage, oauthMessage } from "../messages";
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
  const next = typeof params.next === "string" ? params.next : "/app";
  const pending = params.link ? await readPending() : null;
  const linking = pending?.intent === "link" ? pending : null;

  let notice: { tone: "info" | "negative" | "positive"; text: string } | undefined;
  if (typeof params.locked === "string") notice = { tone: "negative", text: lockedMessage(new Date(params.locked)) };
  else if (linking) {
    const p = providerName(linking.provider);
    notice = { tone: "info", text: `You already have an account with ${linking.email}. Sign in the usual way once and we'll link your ${p} account, so ${p} can sign you in from then on.` };
  } else if (params.link) notice = { tone: "info", text: "That took too long. Try again." };
  else if (typeof params.oauth === "string") notice = oauthMessage(params.oauth, typeof params.p === "string" ? params.p : undefined);
  else if (params.expired) notice = { tone: "info", text: "Your sign-in timed out. Enter your password again." };
  else if (params.reset) notice = { tone: "positive", text: "Your password is changed and every device is signed out. Sign in with the new password, then your authenticator code." };
  else if (params["signed-out"]) notice = { tone: "positive", text: "You've signed out." };

  // While a Microsoft or Google account waits to be linked, any other way in links it.
  const providers = enabledProviders("CUSTOMER").filter((p) => p !== linking?.provider);
  const others = (
    <>
      <div className="flex flex-col gap-3">
        <ProviderButtons providers={providers} next={next} />
        <PasskeyButton purpose="sign-in" next={next}>
          Sign in with a passkey
        </PasskeyButton>
      </div>
      <OrDivider>or use your email</OrDivider>
    </>
  );

  return (
    <AuthShell>
      <SignInForm consoleName={env().CONSOLE_NAME} next={next} notice={notice} email={linking?.email} others={others} />
    </AuthShell>
  );
}
