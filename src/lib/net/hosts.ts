/**
 * The public website and the console on their own hosts (Milestone 10):
 * fourthgeneration.technology for the site, www sent to it, and
 * console.fourthgeneration.technology for signed-in customers and staff.
 * One app serves both; this decides which host a path belongs on. With no
 * SITE_URL (development, CI) everything stays on one host.
 */

export interface HostPlan {
  site: URL;
  console: URL;
}

export function hostPlan(siteUrl: string | undefined, appUrl: string | undefined): HostPlan | null {
  if (!siteUrl || !appUrl) return null;
  const site = new URL(siteUrl);
  const console = new URL(appUrl);
  return site.host === console.host ? null : { site, console };
}

/** Paths that belong to the console: sign-in, accounts, the customer and staff consoles. */
const CONSOLE = ["/app", "/admin", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/invite", "/setup-authenticator", "/auth", "/quote", "/stub-gateway", "/preview"];
/** Served on either host: the editor's API, assets, images, health and machine files. */
const EITHER = ["/api", "/_next", "/media", "/brand", "/site", "/fonts", "/favicon.ico", "/icon", "/apple-icon", "/robots.txt", "/sitemap.xml", "/.well-known"];

const under = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export type HostRole = "console" | "site" | "either";

export function roleOfPath(pathname: string): HostRole {
  if (under(pathname, EITHER)) return "either";
  if (under(pathname, CONSOLE)) return "console";
  return "site";
}

/**
 * Where a request should go instead, or null to serve it here. "www." goes
 * to the site; console pages asked for on the site go to the console, and
 * site pages asked for on the console go to the site, keeping the path and
 * query. Draft previews stay where they are: the editor's draft cookie
 * belongs to the console host.
 */
export function hostRedirect(url: URL, host: string | null, plan: HostPlan | null, inDraft = false): URL | null {
  if (!plan || !host) return null;
  const h = host.toLowerCase();
  const role = roleOfPath(url.pathname);
  const to = (base: URL) => new URL(`${url.pathname}${url.search}`, base);
  if (h === `www.${plan.site.host}`) return to(role === "console" ? plan.console : plan.site);
  if (h === plan.site.host && role === "console") return to(plan.console);
  if (h === plan.console.host && role === "site" && !inDraft) return to(plan.site);
  return null;
}

/**
 * The parent domain both hosts share, for cookies the site sets and the
 * console reads (the domain cart, the market, the campaign). Null when the
 * hosts share nothing or there is only one.
 */
export function sharedCookieDomain(plan: HostPlan | null): string | null {
  if (!plan) return null;
  const site = plan.site.hostname;
  const console = plan.console.hostname;
  return console.endsWith(`.${site}`) ? site : null;
}
