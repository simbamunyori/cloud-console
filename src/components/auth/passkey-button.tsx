"use client";

import type { UserKind } from "@prisma/client";
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { passkeyOptionsAction, passkeyVerifyAction, type PasskeyResult } from "@/app/(frontend)/(auth)/passkey-actions";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ChallengePurpose } from "@/server/auth/flow-cookies";

/** Whether this browser can use passkeys; false until known, so nothing flashes. */
const noSubscription = () => () => {};
export function usePasskeySupport(): boolean {
  return useSyncExternalStore(noSubscription, browserSupportsWebAuthn, () => false);
}

/**
 * One passkey use: sign in, the second step, setting one up, adding one or
 * the recent check. Asks the server for a challenge, lets the device check
 * the person, and hands the answer back. Hidden where passkeys don't work.
 */
export function PasskeyButton({
  purpose,
  audience = "CUSTOMER",
  next,
  children,
  onDone,
  variant = "secondary",
  size = "lg",
  className,
  after,
}: {
  purpose: ChallengePurpose;
  audience?: UserKind;
  next?: string;
  children: React.ReactNode;
  /** Called when the result doesn't move to another page (new backup codes, a passkey added). */
  onDone?: (result: PasskeyResult) => void;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Shown under the button, only where passkeys work (e.g. an "or" rule). */
  after?: React.ReactNode;
}) {
  const supported = usePasskeySupport();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  if (!supported) return null;

  const run = () =>
    start(async () => {
      setError(undefined);
      const got = await passkeyOptionsAction(purpose, audience);
      if ("error" in got) {
        if (got.redirect) return router.push(got.redirect);
        return setError(got.error);
      }
      let response;
      try {
        response = got.kind === "register" ? await startRegistration({ optionsJSON: got.options }) : await startAuthentication({ optionsJSON: got.options });
      } catch (e) {
        const code = e instanceof WebAuthnError ? e.code : "";
        return setError(
          code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" ? "This device already has a passkey for your account." : "The passkey check was cancelled or timed out. Try again, or use another way.",
        );
      }
      const result = await passkeyVerifyAction(purpose, audience, response, next);
      if (result.redirect) {
        // A new session: load the next page afresh so every part of it sees who is signed in.
        return window.location.assign(result.redirect);
      }
      if (result.error) return setError(result.error);
      onDone?.(result);
    });

  return (
    <div className={className}>
      <Button type="button" variant={variant} size={size} onClick={run} disabled={pending} className="w-full">
        <Fingerprint aria-hidden />
        {pending ? "Waiting for your device…" : children}
      </Button>
      {error ? <Alert className="mt-3">{error}</Alert> : null}
      {after}
    </div>
  );
}
