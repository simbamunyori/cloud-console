"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthHeading } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import { PasswordField } from "@/components/ui/password-field";
import { joinWaitlistAction, signUpAction, type FormState } from "../actions";

type Option = { value: string; label: string };

export function SignUpForm({ consoleName, countries, detectedCountry }: { consoleName: string; countries: Option[]; detectedCountry?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  const fe = state.fieldErrors ?? {};
  if (state.unavailable) {
    return <WaitlistForm countries={countries} values={state.values ?? {}} />;
  }
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <AuthHeading eyebrow="Step 1 of 2" title="Open an account">
        One account for your organisation&apos;s cloud services. You can invite your team once you&apos;re in.
      </AuthHeading>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <TextField
        id="organisation"
        label="Organisation name"
        autoComplete="organization"
        required
        defaultValue={state.values?.organisation}
        error={fe.organisation}
        hint="Your business, school or institution, as it appears on invoices."
      />
      <SelectField
        id="country"
        label="Billing country"
        autoComplete="country"
        required
        placeholder="Choose a country"
        options={countries}
        defaultValue={state.values?.country ?? detectedCountry ?? ""}
        error={fe.country}
        hint="Where your organisation is billed. It sets your currency and can't be changed later without our help."
      />
      <TextField id="name" label="Your name" autoComplete="name" required defaultValue={state.values?.name} error={fe.name} />
      <TextField
        id="email"
        label="Work email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={fe.email}
      />
      <PasswordField id="password" label="Password" autoComplete="new-password" showStrength error={fe.password} />
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Opening your account…" : "Continue"}
        </Button>
        <p className="text-center text-callout text-ink-muted">
          Next you&apos;ll set up an authenticator app. Every account needs one.
        </p>
      </div>
      <p className="border-t border-border pt-4 text-callout text-ink-muted">
        Already use {consoleName}?{" "}
        <Link href="/sign-in" className="font-medium text-link hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function WaitlistForm({ countries, values }: { countries: Option[]; values: Record<string, string> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinWaitlistAction, {});
  const country = countries.find((c) => c.value === (state.values?.country ?? values.country))?.label;
  if (state.joined) {
    return (
      <div className="flex flex-col gap-6">
        <AuthHeading title="Thanks, we'll be in touch">
          We&apos;ve saved your details. We&apos;ll email {state.values?.email} as soon as we can serve {country ?? "your country"}.
        </AuthHeading>
        <Link href="/" className="text-callout font-medium text-link hover:underline">
          Back to the home page
        </Link>
      </div>
    );
  }
  const v = state.values ?? values;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <AuthHeading title="Not available in your country yet">
        We don&apos;t serve {country ?? "your country"} yet, so we haven&apos;t opened an account. Leave your details and we&apos;ll tell you when we do.
      </AuthHeading>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <SelectField id="country" label="Country" autoComplete="country" required options={countries} defaultValue={v.country ?? ""} error={fe.country} />
      <TextField id="name" label="Your name" autoComplete="name" required defaultValue={v.name} error={fe.name} />
      <TextField id="email" label="Work email" type="email" autoComplete="email" inputMode="email" required defaultValue={v.email} error={fe.email} />
      <TextField id="company" label="Organisation (optional)" autoComplete="organization" defaultValue={v.company ?? v.organisation} error={fe.company} />
      <TextField id="phone" label="Phone (optional)" type="tel" autoComplete="tel" defaultValue={v.phone} error={fe.phone} />
      <TextareaField id="message" label="What would you like us to run for you? (optional)" rows={3} maxLength={1000} defaultValue={v.message} error={fe.message} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Tell me when you're ready"}
      </Button>
    </form>
  );
}
