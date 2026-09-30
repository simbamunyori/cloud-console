import { NextResponse, type NextRequest } from "next/server";
import { ipAllowed, parseAllowlist } from "@/lib/net/ip-allowlist";

/**
 * Runs before every page:
 * - a fresh nonce per request for the content security policy, so only
 *   scripts the server rendered can run;
 * - /admin refused outside ADMIN_IP_ALLOWLIST, when one is set;
 * - framing allowed from this site only in draft mode (the website
 *   editor's live preview), never otherwise.
 */

function clientIp(req: NextRequest): string | null {
  // Apache (deploy/apache-console.conf) or Caddy replaces X-Forwarded-For with the connecting address, so the
  // first entry is the client. Without a proxy in front, don't trust it.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

export function contentSecurityPolicy(nonce: string, dev: boolean, framedBySite = false, upgrade = !dev): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Style attributes (e.g. widths on progress bars) need inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    // The website editor's live preview frames the site; nothing else may.
    framedBySite ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    ...(upgrade ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const allowlist = parseAllowlist(process.env.ADMIN_IP_ALLOWLIST ?? "");
    if (!ipAllowed(clientIp(req), allowlist)) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV === "development";
  // A server on plain http (a test server) can't upgrade its own requests.
  const upgrade = !dev && !process.env.APP_URL?.startsWith("http://");
  const csp = contentSecurityPolicy(nonce, dev, req.cookies.has("__prerender_bypass"), upgrade);
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
