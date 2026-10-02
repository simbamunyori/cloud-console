import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { countryOptions } from "@/lib/countries";
import { OrDivider, ProviderButtons } from "@/components/auth/provider-buttons";
import { readPending } from "@/server/auth/flow-cookies";
import { currentSession } from "@/server/auth/next";
import { providerName } from "@/server/auth/oauth";
import { enabledProviders } from "@/server/auth/sign-in-options";
import { env } from "@/server/env";
import { requestCountry } from "@/server/markets/geo";
import { safeNext } from "../shared";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Open an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await currentSession();
  if (session?.stage === "ACTIVE") redirect(safeNext(typeof params.next === "string" ? params.next : "", "CUSTOMER"));
  const pending = params.with ? await readPending() : null;
  const identity = pending?.intent === "sign-up" ? { provider: providerName(pending.provider), email: pending.email, name: pending.name ?? "" } : undefined;
  return (
    <AuthShell>
      <SignUpForm
        consoleName={env().CONSOLE_NAME}
        countries={countryOptions()}
        detectedCountry={await requestCountry()}
        identity={identity}
        expired={Boolean(params.with) && !identity}
        next={safeNext(typeof params.next === "string" ? params.next : "", "CUSTOMER")}
        others={
          identity ? null : (
            <>
              <ProviderButtons providers={enabledProviders("CUSTOMER")} verb="Sign up" />
              {enabledProviders("CUSTOMER").length ? <OrDivider>or use your email</OrDivider> : null}
            </>
          )
        }
      />
    </AuthShell>
  );
}
