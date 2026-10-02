import "server-only";
import { cookies } from "next/headers";
import type { UserKind } from "@prisma/client";
import { clearPending, readPending } from "@/server/auth/flow-cookies";
import { linkIdentity } from "@/server/auth/identities";
import { authDeps, requestContext } from "@/server/auth/next";
import { providerSlug } from "@/server/auth/oauth";
import { AuthError, getSession } from "@/server/auth/service";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { enforce, LIMITS } from "@/server/security/rate-limit";

export function field(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

/** Only relative paths inside the console, so a link can't bounce people elsewhere. */
export function safeNext(next: string, audience: UserKind): string {
  if (audience === "STAFF") return /^\/admin(\/[\w\-/]*)?$/.test(next) ? next : "/admin";
  // The domain search may carry its query, as the site's "Find your domain" sends it.
  if (/^\/app\/marketplace\/domains\?q=[\w.%-]{1,300}$/.test(next)) return next;
  // A free tool's result goes straight to the order with its numbers (Milestone 8).
  if (/^\/app\/marketplace\/[\w-]{1,80}\?quantity=\d{1,5}$/.test(next)) return next;
  return /^\/(app(\/[\w\-/]*)?|(invite|quote)\/[\w\-%]+)$/.test(next) ? next : "/app";
}

export const PATHS: Record<UserKind, { signIn: string; code: string; setup: string }> = {
  CUSTOMER: { signIn: "/sign-in", code: "/sign-in/code", setup: "/setup-authenticator" },
  STAFF: { signIn: "/admin/sign-in", code: "/admin/sign-in/code", setup: "/admin/setup-authenticator" },
};

export async function limitByIp(kind: keyof typeof LIMITS) {
  const ip = (await requestContext()).ipAddress ?? "unknown";
  await enforce(prisma, `${kind}:${ip}`, LIMITS[kind]);
}

/**
 * Straight after a customer signs in the usual way: links the Microsoft or
 * Google account they were asked to confirm, if any. Returns where to go
 * next: the Security page saying so, or `next` when nothing was waiting.
 */
export async function afterSignIn(token: string, next: string): Promise<string> {
  const pending = await readPending();
  if (pending?.intent !== "link") return next;
  await clearPending();
  const session = await getSession(authDeps(), token, "CUSTOMER");
  if (session?.stage !== "ACTIVE") return next;
  try {
    await linkIdentity(authDeps(), session, pending, await requestContext());
    await runSoon("email-deliver").catch(() => undefined);
  } catch (e) {
    if (e instanceof AuthError) return `/app/security?link-error=${e.message.includes("someone else") ? "taken" : "email"}`;
    throw e;
  }
  return `/app/security?linked=${providerSlug(pending.provider)}`;
}

/**
 * Where a new account goes once its authenticator is set up, e.g. the
 * order a free tool worked out. Kept for half an hour in a cookie, as
 * the setup page sits between sign-up and the order.
 */
export const NEXT_COOKIE = "console_after_setup";

export async function rememberNext(next: string) {
  const jar = await cookies();
  if (next === "/app") jar.delete(NEXT_COOKIE);
  else jar.set(NEXT_COOKIE, next, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 60 });
}

export async function rememberedNext(): Promise<string> {
  return safeNext((await cookies()).get(NEXT_COOKIE)?.value ?? "", "CUSTOMER");
}
