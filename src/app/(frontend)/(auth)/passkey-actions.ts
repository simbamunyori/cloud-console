"use server";

import type { UserKind } from "@prisma/client";
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { revalidatePath } from "next/cache";
import { saveChallenge, takeChallenge, type ChallengePurpose } from "@/server/auth/flow-cookies";
import { authDeps, clearSessionCookie, currentSession, readSessionToken, requestContext, setSessionCookie } from "@/server/auth/next";
import {
  addPasskey,
  authenticationOptions,
  authenticationOptionsFor,
  completeSignInWithPasskey,
  registrationOptions,
  setupWithPasskey,
  signInWithPasskey,
  stepUpWithPasskey,
} from "@/server/auth/passkeys";
import { AuthError } from "@/server/auth/service";
import { consoleRelyingParty } from "@/server/auth/sign-in-options";
import { stepUpFresh } from "@/server/auth/step-up";
import { runSoon } from "@/server/jobs/boss";
import { RateLimitedError } from "@/server/security/rate-limit";
import { lockedMessage, rateLimitedMessage } from "./messages";
import { afterSignIn, limitByIp, PATHS, safeNext } from "./shared";

/**
 * Passkeys from the browser (docs/FINAL_BUILD.md, Milestone 5). Each use
 * is two calls: the options, whose challenge is kept in a sealed cookie,
 * then the device's answer. What a passkey is for decides which session it
 * needs: none to sign in (customers only; staff start with Microsoft or a
 * password), a half-finished one for the second step or setting up, and a
 * full one to add a passkey or confirm a sensitive action.
 */

export type PasskeyOptions =
  { kind: "authenticate"; options: PublicKeyCredentialRequestOptionsJSON } | { kind: "register"; options: PublicKeyCredentialCreationOptionsJSON } | { error: string; redirect?: string };

export interface PasskeyResult {
  error?: string;
  redirect?: string;
  recoveryCodes?: string[];
  ok?: boolean;
}

const confirmPath = (audience: UserKind, next: string) => `${audience === "STAFF" ? "/admin" : "/app"}/confirm?next=${encodeURIComponent(next)}`;

export async function passkeyOptionsAction(purpose: ChallengePurpose, audience: UserKind): Promise<PasskeyOptions> {
  if (audience !== "CUSTOMER" && audience !== "STAFF") return { error: "Something went wrong. Refresh the page." };
  const rp = consoleRelyingParty();
  const deps = authDeps();
  try {
    if (purpose === "sign-in") {
      if (audience === "STAFF") return { error: "Staff sign in with Microsoft or a password first." };
      const options = await authenticationOptions(rp);
      await saveChallenge({ challenge: options.challenge, purpose });
      return { kind: "authenticate", options };
    }
    const session = await currentSession(audience);
    const needs = purpose === "second-step" ? "CODE_PENDING" : purpose === "setup" ? "SETUP_PENDING" : "ACTIVE";
    if (session?.stage !== needs) return { error: "Your sign-in timed out.", redirect: `${PATHS[audience].signIn}?expired=1` };
    if (purpose === "add" && !stepUpFresh(session)) return { error: "Confirm it's you first.", redirect: confirmPath(audience, audience === "STAFF" ? "/admin/account" : "/app/security") };
    const register = purpose === "setup" || purpose === "add";
    const options = register ? await registrationOptions(deps, rp, session.user) : await authenticationOptionsFor(deps, rp, session.userId);
    await saveChallenge({ challenge: options.challenge, purpose, userId: session.userId });
    return register ? { kind: "register", options: options as PublicKeyCredentialCreationOptionsJSON } : { kind: "authenticate", options: options as PublicKeyCredentialRequestOptionsJSON };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function passkeyVerifyAction(purpose: ChallengePurpose, audience: UserKind, response: AuthenticationResponseJSON | RegistrationResponseJSON, next = ""): Promise<PasskeyResult> {
  if (audience !== "CUSTOMER" && audience !== "STAFF") return { error: "Something went wrong. Refresh the page." };
  const rp = consoleRelyingParty();
  const deps = authDeps();
  const ctx = await requestContext();
  const safe = safeNext(next, audience);
  const expired = { error: "That took too long. Try again." };
  try {
    await limitByIp("codePerIp");
    if (purpose === "sign-in") {
      if (audience === "STAFF") return { error: "Staff sign in with Microsoft or a password first." };
      const challenge = await takeChallenge("sign-in");
      if (!challenge) return expired;
      const { token } = await signInWithPasskey(deps, rp, response as AuthenticationResponseJSON, challenge, audience, ctx);
      await setSessionCookie(token, audience);
      return { redirect: await afterSignIn(token, safe) };
    }

    const session = await currentSession(audience);
    if (!session) return { error: "Your sign-in timed out.", redirect: `${PATHS[audience].signIn}?expired=1` };
    const challenge = await takeChallenge(purpose, session.userId);
    if (!challenge) return expired;
    const token = (await readSessionToken(audience)) ?? "";

    if (purpose === "second-step") {
      const result = await completeSignInWithPasskey(deps, rp, token, response as AuthenticationResponseJSON, challenge, ctx);
      await setSessionCookie(result.token, audience);
      return { redirect: audience === "CUSTOMER" ? await afterSignIn(result.token, safe) : safe };
    }
    if (purpose === "setup") {
      const result = await setupWithPasskey(deps, rp, token, response as RegistrationResponseJSON, challenge, ctx);
      await setSessionCookie(result.token, audience);
      await runSoon("email-deliver").catch(() => undefined);
      return { recoveryCodes: result.recoveryCodes };
    }
    if (purpose === "add") {
      await addPasskey(deps, rp, session, response as RegistrationResponseJSON, challenge, ctx);
      await runSoon("email-deliver").catch(() => undefined);
      revalidatePath(audience === "STAFF" ? "/admin/account" : "/app/security");
      return { ok: true };
    }
    await stepUpWithPasskey(deps, rp, session, response as AuthenticationResponseJSON, challenge);
    return { redirect: safe };
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: rateLimitedMessage(e.retryAt) };
    if (e instanceof AuthError) {
      if (e.code === "locked") {
        await clearSessionCookie(audience);
        return { error: lockedMessage(e.lockedUntil), redirect: `${PATHS[audience].signIn}?locked=${e.lockedUntil?.toISOString() ?? ""}` };
      }
      if (e.code === "no-session") return { error: "Your sign-in timed out.", redirect: `${PATHS[audience].signIn}?expired=1` };
      if (e.code === "step-up") return { error: e.message, redirect: confirmPath(audience, audience === "STAFF" ? "/admin/account" : "/app/security") };
      return { error: e.message };
    }
    throw e;
  }
}
