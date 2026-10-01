import "server-only";
import type { UserKind } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { runSoon } from "@/server/jobs/boss";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { prisma } from "@/server/db";
import { savePending, saveOAuthFlow, takeOAuthFlow } from "./flow-cookies";
import { linkIdentity, pendingFrom, signInWithProfile } from "./identities";
import { authDeps, currentSession, requestContext, setSessionCookie } from "./next";
import { authorizeUrl, exchangeCode, newFlowSecrets, OAuthError, providerFromSlug, providerSlug, verifyIdToken, type OAuthIntent } from "./oauth";
import { AuthError } from "./service";
import { callbackUrl, providerSettings } from "./sign-in-options";
import { stepUpFresh } from "./step-up";

/**
 * The two ends of a Microsoft or Google sign-in: /auth/{provider}/start
 * sends the person to the provider, and /auth/{provider}/callback takes
 * them back. Staff use the same under /admin. Links, not forms, start it,
 * since the content security policy only lets forms post to this site.
 */

const SIGN_IN: Record<UserKind, string> = { CUSTOMER: "/sign-in", STAFF: "/admin/sign-in" };
const CODE: Record<UserKind, string> = { CUSTOMER: "/sign-in/code", STAFF: "/admin/sign-in/code" };
const SETUP: Record<UserKind, string> = { CUSTOMER: "/setup-authenticator", STAFF: "/admin/setup-authenticator" };

const to = (path: string) => NextResponse.redirect(new URL(path, env().APP_URL), 303);

/**
 * After signing staff in. Their session cookie is SameSite=Strict, and a
 * redirect chain that began at Microsoft counts as cross-site, so the next
 * page wouldn't see it. A page on our own site moving on by itself makes
 * that next request same-site.
 */
function onward(path: string, audience: UserKind): NextResponse {
  if (audience !== "STAFF") return to(path);
  const url = new URL(path, env().APP_URL).toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return new NextResponse(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}"><title>Signing in</title><a href="${url}">Continue</a>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeNext(next: string | null, audience: UserKind): string {
  const home = audience === "STAFF" ? "/admin" : "/app";
  return next && /^\/[\w\-/]*$/.test(next) && (next === home || next.startsWith(`${home}/`) || /^\/(invite|quote)\//.test(next)) ? next : home;
}

export async function startOAuth(req: NextRequest, slug: string, audience: UserKind): Promise<NextResponse> {
  const provider = providerFromSlug(slug);
  const settings = provider && providerSettings(provider, audience);
  if (!provider || !settings) return to(SIGN_IN[audience]);
  const intent: OAuthIntent = audience === "CUSTOMER" && req.nextUrl.searchParams.get("intent") === "link" ? "link" : "sign-in";
  let loginHint: string | undefined;
  if (intent === "link") {
    const session = await currentSession("CUSTOMER");
    if (session?.stage !== "ACTIVE") return to(`${SIGN_IN.CUSTOMER}?expired=1`);
    if (!stepUpFresh(session)) return to(`/app/confirm?next=${encodeURIComponent("/app/security")}`);
    loginHint = session.user.email;
  }
  const secrets = newFlowSecrets();
  await saveOAuthFlow({ ...secrets, provider, audience, intent, next: safeNext(req.nextUrl.searchParams.get("next"), audience), expires: Date.now() + 10 * 60_000 });
  return NextResponse.redirect(authorizeUrl(settings, secrets, callbackUrl(provider, audience), { loginHint }), 303);
}

export async function finishOAuth(req: NextRequest, slug: string, audience: UserKind): Promise<NextResponse> {
  const provider = providerFromSlug(slug);
  const settings = provider && providerSettings(provider, audience);
  const flow = await takeOAuthFlow();
  const q = req.nextUrl.searchParams;
  const p = `p=${slug === "google" ? "google" : "microsoft"}`;
  if (!provider || !settings || !flow || flow.provider !== provider || flow.audience !== audience || flow.expires < Date.now() || q.get("state") !== flow.state) {
    return to(`${SIGN_IN[audience]}?oauth=expired&${p}`);
  }
  const back = flow.intent === "link" ? "/app/security?link-error=" : `${SIGN_IN[audience]}?${p}&oauth=`;
  if (q.get("error") || !q.get("code")) return to(`${back}${q.get("error") === "access_denied" ? "cancelled" : "failed"}`);

  const ctx = await requestContext();
  try {
    await enforce(prisma, `signInPerIp:${ctx.ipAddress ?? "unknown"}`, LIMITS.signInPerIp);
    const idToken = await exchangeCode(settings, q.get("code")!, flow.verifier, callbackUrl(provider, audience));
    const profile = await verifyIdToken(settings, idToken, flow.nonce);

    if (flow.intent === "link") {
      const session = await currentSession("CUSTOMER");
      if (session?.stage !== "ACTIVE") return to(`${SIGN_IN.CUSTOMER}?expired=1`);
      if (!profile.email || !profile.emailVerified || profile.email !== session.user.email) return to(`${back}email&${p}`);
      await linkIdentity(authDeps(), session, pendingFrom(profile), ctx);
      await runSoon("email-deliver").catch(() => undefined);
      return to(`/app/security?linked=${providerSlug(provider)}`);
    }

    const outcome = await signInWithProfile(authDeps(), profile, audience, ctx);
    if (outcome.kind === "session") {
      await setSessionCookie(outcome.token, audience);
      return onward(outcome.stage === "SETUP_PENDING" ? SETUP[audience] : `${CODE[audience]}?next=${encodeURIComponent(flow.next)}`, audience);
    }
    if (outcome.kind === "confirm-link") {
      await savePending({ ...pendingFrom(profile), intent: "link" });
      return to(`${SIGN_IN.CUSTOMER}?link=${providerSlug(provider)}`);
    }
    if (outcome.kind === "sign-up") {
      await savePending({ ...pendingFrom(profile), intent: "sign-up" });
      return to(`/sign-up?with=${providerSlug(provider)}`);
    }
    return to(`${back}${outcome.reason}`);
  } catch (e) {
    if (e instanceof OAuthError) return to(`${back}failed`);
    if (e instanceof RateLimitedError) return to(`${back}busy`);
    if (e instanceof AuthError) {
      if (e.code === "locked") return to(`${SIGN_IN[audience]}?locked=${e.lockedUntil?.toISOString() ?? ""}`);
      if (e.code === "step-up") return to(`/app/confirm?next=${encodeURIComponent("/app/security")}`);
      return to(`${back}${flow.intent === "link" ? "taken" : "failed"}`);
    }
    throw e;
  }
}
