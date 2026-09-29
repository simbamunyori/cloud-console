import type { UserKind } from "@prisma/client";

/** __Host- makes the browser insist on HTTPS, this exact host and path "/". */
export const SESSION_COOKIE: Record<UserKind, string> =
  process.env.NODE_ENV === "production"
    ? { CUSTOMER: "__Host-console_session", STAFF: "__Host-console_staff" }
    : { CUSTOMER: "console_session", STAFF: "console_staff" };

/** One cookie's value from a Cookie request header. */
export function cookieValue(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}
