import "server-only";
import type { UserKind } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { totpKey } from "@/server/secrets";
import { SESSION_COOKIE } from "./cookies";
import { getSession, type AuthDeps, type RequestContext, type SessionWithUser } from "./service";

/**
 * Next.js glue for the auth service: the session cookies, request
 * details for the sign-in history, and guards for pages. Customers and
 * staff have separate cookies; neither opens the other console.
 */

const SECURE = process.env.NODE_ENV === "production";
const COOKIE = SESSION_COOKIE;

export function authDeps(): AuthDeps {
  return { db: prisma, encryptionKey: totpKey(), issuer: env().CONSOLE_NAME };
}

export async function requestContext(): Promise<RequestContext> {
  const h = await headers();
  // Caddy sets X-Forwarded-For to the connecting address; the first entry is the client.
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ipAddress: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

export async function readSessionToken(audience: UserKind = "CUSTOMER"): Promise<string | undefined> {
  return (await cookies()).get(COOKIE[audience])?.value;
}

export async function setSessionCookie(token: string, audience: UserKind = "CUSTOMER") {
  (await cookies()).set(COOKIE[audience], token, {
    httpOnly: true,
    secure: SECURE,
    // Strict for staff: no link from anywhere else carries the staff session.
    sameSite: audience === "STAFF" ? "strict" : "lax",
    path: "/",
    // The server decides expiry; this only bounds how long the browser keeps it.
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(audience: UserKind = "CUSTOMER") {
  (await cookies()).delete(COOKIE[audience]);
}

export async function currentSession(audience: UserKind = "CUSTOMER"): Promise<SessionWithUser | null> {
  const token = await readSessionToken(audience);
  if (!token) return null;
  return getSession(authDeps(), token, audience);
}

/** Where a customer session in each stage belongs. */
export function homeFor(session: SessionWithUser | null): string {
  if (!session) return "/sign-in";
  if (session.stage === "CODE_PENDING") return "/sign-in/code";
  if (session.stage === "SETUP_PENDING") return "/setup-authenticator";
  return "/app";
}

/** Where a staff session in each stage belongs. */
export function staffHomeFor(session: SessionWithUser | null): string {
  if (!session) return "/admin/sign-in";
  if (session.stage === "CODE_PENDING") return "/admin/sign-in/code";
  if (session.stage === "SETUP_PENDING") return "/admin/setup-authenticator";
  return "/admin";
}

/** For customer pages: a fully signed-in session, or off to sign in. */
export async function requireActiveSession(): Promise<SessionWithUser> {
  const session = await currentSession("CUSTOMER");
  if (session?.stage !== "ACTIVE") redirect(homeFor(session));
  return session;
}

/** For staff pages. */
export async function requireActiveStaffSession(): Promise<SessionWithUser> {
  const session = await currentSession("STAFF");
  if (session?.stage !== "ACTIVE") redirect(staffHomeFor(session));
  return session;
}
