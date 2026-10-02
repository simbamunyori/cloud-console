import { describe, expect, it } from "vitest";
import { hostPlan, hostRedirect, roleOfPath, sharedCookieDomain } from "./hosts";

const plan = hostPlan("https://fourthgeneration.technology", "https://console.fourthgeneration.technology");
const at = (path: string) => new URL(path, "https://x.example");
const go = (host: string, path: string, draft = false) => hostRedirect(at(path), host, plan, draft)?.toString() ?? null;

describe("site and console on their own hosts", () => {
  it("does nothing with one host, as in development and CI", () => {
    expect(hostPlan(undefined, "http://localhost:3000")).toBeNull();
    expect(hostPlan("http://localhost:3000", "http://localhost:3000/")).toBeNull();
    expect(hostRedirect(at("/app"), "localhost:3000", null)).toBeNull();
  });

  it("sends www to the site, keeping the path and query", () => {
    expect(go("www.fourthgeneration.technology", "/bw/pricing?x=1")).toBe("https://fourthgeneration.technology/bw/pricing?x=1");
    expect(go("WWW.fourthgeneration.technology", "/")).toBe("https://fourthgeneration.technology/");
    expect(go("www.fourthgeneration.technology", "/sign-in")).toBe("https://console.fourthgeneration.technology/sign-in");
  });

  it("sends sign-in and the consoles from the site to the console", () => {
    for (const p of ["/sign-in?next=%2Fapp%2Fcart", "/sign-up", "/app/cart", "/admin", "/admin/content", "/reset-password/abc", "/quote/abc", "/auth/google/callback"]) {
      expect(go("fourthgeneration.technology", p)).toBe(`https://console.fourthgeneration.technology${p}`);
    }
  });

  it("sends site pages from the console to the site, except draft previews", () => {
    for (const p of ["/", "/bw", "/bw/pricing", "/za/products/x", "/privacy", "/switch-market?to=za", "/find-domain"]) {
      expect(go("console.fourthgeneration.technology", p)).toBe(`https://fourthgeneration.technology${p}`);
    }
    expect(go("console.fourthgeneration.technology", "/bw", true)).toBeNull();
  });

  it("serves shared paths on either host and pages where they belong", () => {
    for (const p of ["/api/share/x", "/_next/data/x", "/media/a.png", "/sitemap.xml", "/robots.txt", "/brand/logo.svg"]) {
      expect(roleOfPath(p)).toBe("either");
      expect(go("fourthgeneration.technology", p)).toBeNull();
      expect(go("console.fourthgeneration.technology", p)).toBeNull();
    }
    expect(go("fourthgeneration.technology", "/bw")).toBeNull();
    expect(go("console.fourthgeneration.technology", "/app")).toBeNull();
    // "/application" is not "/app".
    expect(roleOfPath("/application")).toBe("site");
    // An unknown host (a health check by IP) is left alone.
    expect(go("127.0.0.1:3000", "/app")).toBeNull();
  });

  it("shares cookies across the parent domain only when the console is under the site", () => {
    expect(sharedCookieDomain(plan)).toBe("fourthgeneration.technology");
    expect(sharedCookieDomain(hostPlan("https://example.com", "https://console.other.com"))).toBeNull();
    expect(sharedCookieDomain(null)).toBeNull();
  });
});
