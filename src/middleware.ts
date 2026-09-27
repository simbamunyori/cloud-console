import { NextResponse, type NextRequest } from "next/server";
import { ipAllowed, parseAllowlist } from "@/lib/net/ip-allowlist";

/**
 * Runs before every page:
 * - a fresh nonce per request for the content security policy, so only
 *   scripts the server rendered can run;
 * - /admin refused outside ADMIN_IP_ALLOWLIST, when one is set.
 */

function clientIp(req: NextRequest): string | null {
  // Caddy replaces X-Forwarded-For with the connecting address, so the
  // first entry is the client. Without a proxy in front, don't trust it.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Style attributes (e.g. widths on progress bars) need inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const allowlist = parseAllowlist(process.env.ADMIN_IP_ALLOWLIST ?? "");
    if (!ipAllowed(clientIp(req), allowlist)) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|brand/|site/|favicon.ico).*)" }],
};
