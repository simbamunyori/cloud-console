"use server";

import type { UserKind } from "@prisma/client";
import { redirect } from "next/navigation";
import { authDeps, clearSessionCookie, currentSession, readSessionToken, requestContext, setSessionCookie } from "@/server/auth/next";
import { countForCampaign } from "@/server/campaigns/cookie";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
  AuthError,
  completeSignIn,
  confirmAuthenticatorSetup,
  normaliseEmail,
  requestPasswordReset,
  resetPassword,
  signOut,
  signUp,
  startSignIn,
} from "@/server/auth/service";
import { billingAdapter } from "@/server/billing";
import { ensureBillingAccount } from "@/server/billing/accounts";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { hit, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { isCountryCode } from "@/lib/countries";
import { joinWaitlist } from "@/server/markets/waitlist";
import { DomainError } from "@/server/org/access";
import { clearPending, readPending } from "@/server/auth/flow-cookies";
import { staffPasswordAllowed } from "@/server/auth/sign-in-options";
import { stepUpWithCode } from "@/server/auth/step-up";
import { lockedMessage, rateLimitedMessage } from "./messages";
import { afterSignIn, field, limitByIp, PATHS, safeNext } from "./shared";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so a failed submit doesn't clear what was typed. */
  values?: Record<string, string>;
  /** Changes on every failed attempt, so code boxes can reset. */
  attempt?: number;
  /** Sign-up only: the billing country has no market yet, so no account was made. */
  unavailable?: boolean;
  /** Waiting list only: the details were saved. */
  joined?: boolean;
  /** "Forgot password?" only: the request was taken (whether or not the account exists). */
  sent?: boolean;
}

export interface SetupState extends FormState {
  recoveryCodes?: string[];
}

// ─── Customers ───────────────────────────────────────────────────────

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  // Signing up with a Microsoft or Google account: its verified email, and no password.
  const pending = field(form, "with") ? await readPending() : null;
  const identity = pending?.intent === "sign-up" ? pending : null;
  if (field(form, "with") && !identity) return { error: "The Microsoft or Google sign-in timed out. Start again." };
  const values = { organisation: field(form, "organisation"), name: field(form, "name"), email: identity?.email ?? field(form, "email"), country: field(form, "country") };
  const fieldErrors: Record<string, string> = {};
  if (!values.organisation.trim()) fieldErrors.organisation = "Enter your organisation's name.";
  if (!values.name.trim()) fieldErrors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) fieldErrors.email = "Enter an email address like name@company.com.";
  if (!isCountryCode(values.country)) fieldErrors.country = "Choose the country your organisation is billed in.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  try {
    await limitByIp("signUpPerIp");
    const result = await signUp(
      authDeps(),
      {
        organisationName: values.organisation,
        name: values.name,
        email: values.email,
        country: values.country,
        ...(identity ? { identity: { provider: identity.provider, subject: identity.subject, email: identity.email } } : { password: field(form, "password") }),
      },
      await requestContext(),
    );
    await setSessionCookie(result.token);
    if (identity) await clearPending();
    await countForCampaign("SIGN_UP", result.organisationId);
    // Opens the organisation's billing account now. If the billing engine
    // is down, it is opened the first time billing is used instead.
    await ensureBillingAccount(prisma, billingAdapter(), result.organisationId).catch((err) => console.error("Billing account not opened at sign-up:", err));
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: rateLimitedMessage(e.retryAt), values };
    if (e instanceof AuthError) {
      if (e.code === "email-taken") return { fieldErrors: { email: "There's already an account with this email. Sign in instead." }, values };
      if (e.code === "invalid-input" && identity) return { error: e.message, values };
      if (e.code === "weak-password") return { fieldErrors: { password: "Use at least 12 characters, and avoid your name or email." }, values };
      if (e.code === "invalid-input") return { error: "Fill in every field.", values };
      if (e.code === "no-market") return { unavailable: true, values };
    }
    throw e;
  }
  redirect("/setup-authenticator");
}

/** Saves someone's details when we don't serve their country yet. */
export async function joinWaitlistAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { name: field(form, "name"), email: field(form, "email"), company: field(form, "company"), country: field(form, "country"), phone: field(form, "phone"), message: field(form, "message") };
  try {
    await limitByIp("waitlistPerIp");
    await joinWaitlist(prisma, values);
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: rateLimitedMessage(e.retryAt), values };
    if (e instanceof DomainError) return { error: e.message, fieldErrors: e.fieldErrors, values };
    throw e;
  }
  return { joined: true, values };
}

async function passwordStep(audience: UserKind, form: FormData): Promise<FormState> {
  const values = { email: field(form, "email") };
  const next = safeNext(field(form, "next"), audience);
  let stage: string;
  if (audience === "STAFF" && !staffPasswordAllowed()) return { error: "Staff sign in with Microsoft.", values };
  try {
    await limitByIp("signInPerIp");
    const result = await startSignIn(authDeps(), { email: values.email, password: field(form, "password") }, await requestContext(), audience);
    await setSessionCookie(result.token, audience);
    stage = result.stage;
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: rateLimitedMessage(e.retryAt), values };
    if (e instanceof AuthError && e.code === "invalid-credentials") {
      return { error: "That email and password don't match. Check them and try again.", values };
    }
    if (e instanceof AuthError && e.code === "locked") return { error: lockedMessage(e.lockedUntil), values };
    throw e;
  }
  redirect(stage === "SETUP_PENDING" ? PATHS[audience].setup : `${PATHS[audience].code}?next=${encodeURIComponent(next)}`);
}

async function codeStep(audience: UserKind, form: FormData): Promise<FormState> {
  const token = await readSessionToken(audience);
  const next = safeNext(field(form, "next"), audience);
  const code = field(form, "code") || field(form, "recovery");
  if (!code.trim()) return { error: "Enter the code first." };
  let destination = next;
  try {
    await limitByIp("codePerIp");
    const result = await completeSignIn(authDeps(), token ?? "", code, await requestContext());
    await setSessionCookie(result.token, audience);
    if (audience === "CUSTOMER") destination = await afterSignIn(result.token, next);
  } catch (e) {
    if (e instanceof RateLimitedError) return { attempt: Date.now(), error: rateLimitedMessage(e.retryAt) };
    if (e instanceof AuthError) {
      if (e.code === "no-session") redirect(`${PATHS[audience].signIn}?expired=1`);
      if (e.code === "locked") {
        await clearSessionCookie(audience);
        redirect(`${PATHS[audience].signIn}?locked=${e.lockedUntil?.toISOString() ?? ""}`);
      }
      return {
        attempt: Date.now(),
        error: field(form, "recovery")
          ? "That backup code didn't work. Each one works only once."
          : "That code didn't work. Codes change every 30 seconds, so use the one showing now.",
      };
    }
    throw e;
  }
  redirect(destination);
}

async function setupStep(audience: UserKind, form: FormData): Promise<SetupState> {
  const token = await readSessionToken(audience);
  try {
    await limitByIp("codePerIp");
    const result = await confirmAuthenticatorSetup(authDeps(), token ?? "", field(form, "code"), await requestContext());
    await setSessionCookie(result.token, audience);
    await runSoon("email-deliver").catch(() => undefined);
    return { recoveryCodes: result.recoveryCodes };
  } catch (e) {
    if (e instanceof RateLimitedError) return { attempt: Date.now(), error: rateLimitedMessage(e.retryAt) };
    if (e instanceof AuthError) {
      if (e.code === "no-session") redirect(`${PATHS[audience].signIn}?expired=1`);
      if (e.code === "locked") {
        await clearSessionCookie(audience);
        redirect(`${PATHS[audience].signIn}?locked=${e.lockedUntil?.toISOString() ?? ""}`);
      }
      return { attempt: Date.now(), error: "That code didn't match. Check the app shows this console, then enter the code showing now." };
    }
    throw e;
  }
}

export async function signInAction(_prev: FormState, form: FormData) {
  return passwordStep("CUSTOMER", form);
}

export async function codeAction(_prev: FormState, form: FormData) {
  return codeStep("CUSTOMER", form);
}

export async function confirmSetupAction(_prev: SetupState, form: FormData) {
  return setupStep("CUSTOMER", form);
}

export async function signOutAction(): Promise<void> {
  await signOut(authDeps(), await readSessionToken("CUSTOMER"));
  await clearSessionCookie("CUSTOMER");
  redirect("/sign-in?signed-out=1");
}

// ─── Forgotten passwords ─────────────────────────────────────────────

/** Always answers the same way, so it can't reveal whether an account exists. */
export async function requestResetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { email: field(form, "email") };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) return { fieldErrors: { email: "Enter an email address like name@company.com." }, values };
  try {
    await limitByIp("resetPerIp");
    // Over the per-account limit, quietly send nothing more: the answer stays the same.
    const perEmail = await hit(prisma, `resetPerEmail:${normaliseEmail(values.email)}`, LIMITS.resetPerEmail);
    if (perEmail.allowed) {
      await requestPasswordReset(authDeps(), values.email, await requestContext());
      await runSoon("email-deliver").catch(() => undefined);
    }
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: rateLimitedMessage(e.retryAt), values };
    throw e;
  }
  return { sent: true, values };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await limitByIp("resetPerIp");
    await resetPassword(authDeps(), field(form, "token"), field(form, "password"), await requestContext());
    await runSoon("email-deliver").catch(() => undefined);
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: rateLimitedMessage(e.retryAt) };
    if (e instanceof AuthError) {
      if (e.code === "weak-password") return { fieldErrors: { password: "Use at least 12 characters, and avoid your name or email." } };
      return { error: "This link has expired or has already been used. Ask for a new one." };
    }
    throw e;
  }
  await clearSessionCookie("CUSTOMER");
  redirect("/sign-in?reset=1");
}

// ─── Staff ───────────────────────────────────────────────────────────

export async function staffSignInAction(_prev: FormState, form: FormData) {
  return passwordStep("STAFF", form);
}

export async function staffCodeAction(_prev: FormState, form: FormData) {
  return codeStep("STAFF", form);
}

export async function staffConfirmSetupAction(_prev: SetupState, form: FormData) {
  return setupStep("STAFF", form);
}

export async function staffSignOutAction(): Promise<void> {
  await signOut(authDeps(), await readSessionToken("STAFF"));
  await clearSessionCookie("STAFF");
  redirect("/admin/sign-in?signed-out=1");
}

// ─── Invitations ─────────────────────────────────────────────────────

export async function acceptInviteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const token = field(form, "token");
  const values = { name: field(form, "name") };
  if (!values.name.trim()) return { fieldErrors: { name: "Enter your name." }, values };
  try {
    await limitByIp("signUpPerIp");
    const result = await acceptInvitationAsNewUser(authDeps(), token, { name: values.name, password: field(form, "password") }, await requestContext());
    await setSessionCookie(result.token);
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: rateLimitedMessage(e.retryAt), values };
    if (e instanceof AuthError) {
      if (e.code === "weak-password") return { fieldErrors: { password: "Use at least 12 characters, and avoid your name or email." }, values };
      if (e.code === "email-taken") return { error: "This email already has an account. Sign in to accept the invitation.", values };
      return { error: e.message, values };
    }
    throw e;
  }
  redirect("/setup-authenticator");
}

export async function joinWithAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await currentSession();
  if (session?.stage !== "ACTIVE") redirect(`/sign-in?next=${encodeURIComponent(`/invite/${field(form, "token")}`)}`);
  try {
    await acceptInvitationAsExistingUser(authDeps(), field(form, "token"), session, await requestContext());
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/app?joined=1");
}

// ─── The recent check before sensitive actions ───────────────────────

async function confirmStep(audience: UserKind, form: FormData): Promise<FormState> {
  const next = safeNext(field(form, "next"), audience);
  const session = await currentSession(audience);
  if (session?.stage !== "ACTIVE") redirect(`${PATHS[audience].signIn}?expired=1`);
  try {
    await limitByIp("codePerIp");
    await stepUpWithCode(authDeps(), session, field(form, "code"), await requestContext());
  } catch (e) {
    if (e instanceof RateLimitedError) return { attempt: Date.now(), error: rateLimitedMessage(e.retryAt) };
    if (e instanceof AuthError) {
      if (e.code === "locked") {
        await signOut(authDeps(), await readSessionToken(audience));
        await clearSessionCookie(audience);
        redirect(`${PATHS[audience].signIn}?locked=${e.lockedUntil?.toISOString() ?? ""}`);
      }
      return { attempt: Date.now(), error: e.message === "That didn't match." ? "That code didn't work. Use the one showing now." : e.message };
    }
    throw e;
  }
  redirect(next);
}

export async function confirmCodeAction(_prev: FormState, form: FormData) {
  return confirmStep("CUSTOMER", form);
}

export async function staffConfirmCodeAction(_prev: FormState, form: FormData) {
  return confirmStep("STAFF", form);
}
