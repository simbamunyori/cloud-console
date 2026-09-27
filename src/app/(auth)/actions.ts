"use server";

import type { UserKind } from "@prisma/client";
import { redirect } from "next/navigation";
import { authDeps, clearSessionCookie, currentSession, readSessionToken, requestContext, setSessionCookie } from "@/server/auth/next";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
  AuthError,
  completeSignIn,
  confirmAuthenticatorSetup,
  signOut,
  signUp,
  startSignIn,
} from "@/server/auth/service";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { lockedMessage, rateLimitedMessage } from "./messages";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so a failed submit doesn't clear what was typed. */
  values?: Record<string, string>;
  /** Changes on every failed attempt, so code boxes can reset. */
  attempt?: number;
}

export interface SetupState extends FormState {
  recoveryCodes?: string[];
}

function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

/** Only relative paths inside the console, so a link can't bounce people elsewhere. */
function safeNext(next: string, audience: UserKind): string {
  if (audience === "STAFF") return /^\/admin(\/[\w\-/]*)?$/.test(next) ? next : "/admin";
  return /^\/(app(\/[\w\-/]*)?|invite\/[\w\-%]+)$/.test(next) ? next : "/app";
}

const PATHS: Record<UserKind, { signIn: string; code: string; setup: string }> = {
  CUSTOMER: { signIn: "/sign-in", code: "/sign-in/code", setup: "/setup-authenticator" },
  STAFF: { signIn: "/admin/sign-in", code: "/admin/sign-in/code", setup: "/admin/setup-authenticator" },
};

async function limitByIp(kind: keyof typeof LIMITS) {
  const ip = (await requestContext()).ipAddress ?? "unknown";
  await enforce(prisma, `${kind}:${ip}`, LIMITS[kind]);
}

// ─── Customers ───────────────────────────────────────────────────────

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = { organisation: field(form, "organisation"), name: field(form, "name"), email: field(form, "email") };
  const fieldErrors: Record<string, string> = {};
  if (!values.organisation.trim()) fieldErrors.organisation = "Enter your organisation's name.";
  if (!values.name.trim()) fieldErrors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) fieldErrors.email = "Enter an email address like name@company.co.bw.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  try {
    await limitByIp("signUpPerIp");
    const result = await signUp(
      authDeps(),
      { organisationName: values.organisation, name: values.name, email: values.email, password: field(form, "password") },
      await requestContext(),
    );
    await setSessionCookie(result.token);
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: rateLimitedMessage(e.retryAt), values };
    if (e instanceof AuthError) {
      if (e.code === "email-taken") return { fieldErrors: { email: "There's already an account with this email. Sign in instead." }, values };
      if (e.code === "weak-password") return { fieldErrors: { password: "Use at least 12 characters, and avoid your name or email." }, values };
      if (e.code === "invalid-input") return { error: "Fill in every field.", values };
    }
    throw e;
  }
  redirect("/setup-authenticator");
}

async function passwordStep(audience: UserKind, form: FormData): Promise<FormState> {
  const values = { email: field(form, "email") };
  const next = safeNext(field(form, "next"), audience);
  let stage: string;
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
  try {
    await limitByIp("codePerIp");
    const result = await completeSignIn(authDeps(), token ?? "", code, await requestContext());
    await setSessionCookie(result.token, audience);
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
  redirect(next);
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
