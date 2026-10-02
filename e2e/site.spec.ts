import { expect, test, type APIResponse } from "@playwright/test";

/**
 * Change Request 01, section 3: how "/" picks a visitor's market, the
 * switcher's cookie beating detection, crawlers never being redirected,
 * and a switched-off market being a 404 only when asked for by name.
 * The demo seed has Botswana (the default) on and the others off.
 */
const PERSON = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function landsOn(res: APIResponse) {
  expect([302, 303, 307, 308]).toContain(res.status());
  return new URL(res.headers()["location"], "http://x").pathname;
}

test.describe("choosing a visitor's market", () => {
  test("sends a visitor from anywhere to the default market", async ({ request }) => {
    expect(landsOn(await request.get("/", { maxRedirects: 0, headers: { "user-agent": PERSON } }))).toBe("/bw");
  });

  test("falls back to the default market when the visitor's country's market is off, never a 404", async ({ request }) => {
    for (const country of ["ZA", "ZW", "US", "XX"]) {
      expect(landsOn(await request.get("/", { maxRedirects: 0, headers: { "user-agent": PERSON, "cf-ipcountry": country } }))).toBe("/bw");
    }
  });

  test("follows the switcher's cookie, and ignores one for a market that is off", async ({ request }) => {
    expect(landsOn(await request.get("/", { maxRedirects: 0, headers: { "user-agent": PERSON, cookie: "market=bw", "cf-ipcountry": "ZA" } }))).toBe("/bw");
    expect(landsOn(await request.get("/", { maxRedirects: 0, headers: { "user-agent": PERSON, cookie: "market=za" } }))).toBe("/bw");
  });

  test("never redirects a crawler: it gets the default market's home with hreflang alternates", async ({ request }) => {
    const res = await request.get("/", { maxRedirects: 0, headers: { "user-agent": GOOGLEBOT, "cf-ipcountry": "ZA" } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^/"]+\/?"/);
    expect(html).toMatch(/<link rel="alternate" hrefLang="en-BW" href="[^"]*\/bw"/);
    expect(html).toMatch(/<link rel="alternate" hrefLang="x-default"/);
  });

  test("shows a switched-off market as not found only when asked for by name", async ({ request }) => {
    expect((await request.get("/za", { headers: { "user-agent": PERSON } })).status()).toBe(404);
    expect((await request.get("/bw", { headers: { "user-agent": PERSON } })).status()).toBe(200);
  });
});

test.describe("the country switcher", () => {
  test("remembers the choice in a cookie and keeps the visitor on the same page", async ({ request }) => {
    const res = await request.get("/switch-market?to=bw&path=/pricing", { maxRedirects: 0 });
    expect(landsOn(res)).toBe("/bw/pricing");
    const cookie = res.headers()["set-cookie"];
    expect(cookie).toMatch(/^market=bw;/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  test("only follows paths on this site, and only to markets that are on", async ({ request }) => {
    expect(landsOn(await request.get("/switch-market?to=bw&path=//evil.example", { maxRedirects: 0 }))).toBe("/bw");
    expect(landsOn(await request.get("/switch-market?to=za&path=/pricing", { maxRedirects: 0 }))).toBe("/");
  });
});

test.describe("search engines", () => {
  test("list only the markets that are on", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/bw/pricing");
    expect(sitemap).not.toContain("/za");
    expect(await (await request.get("/robots.txt")).text()).toContain("sitemap.xml");
  });

  test("an old /privacy link lands on the visitor's market's privacy notice", async ({ request }) => {
    expect(landsOn(await request.get("/privacy", { maxRedirects: 0, headers: { "user-agent": PERSON } }))).toBe("/bw/legal/privacy");
  });

  test("old website addresses open the new site, permanently", async ({ request }) => {
    for (const old of ["/new", "/new/about", "/new/an-old-post"]) {
      const res = await request.get(old, { maxRedirects: 0, headers: { "user-agent": PERSON } });
      expect(res.status(), old).toBe(308);
      expect(landsOn(res), old).toBe("/");
    }
    expect((await request.get("/newsletter-that-never-was", { maxRedirects: 0 })).status()).toBe(404);
  });
});
