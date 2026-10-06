import { expect, test, type BrowserContext } from "@playwright/test";
import { REVIEW_MARKETS, reviewCustomer } from "./support/markets";
import { PAGES, resolvePath, settled } from "./support/pages";
import { DEMO_STAFF, testSession } from "./support/sessions";

/**
 * STRATEGY_ROLLOUT U11: every console screen at phone width (390 px), as a
 * customer in each market and as staff. Nothing may make the page wider
 * than the screen; wide tables scroll inside their own box instead.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function signInAs(context: BrowserContext, email: string, base: string) {
  const { name, value } = await testSession(email);
  await context.addCookies([
    { name, value, url: base },
    { name: `__Host-${name}`, value, url: base.replace(/^http:/, "https:"), secure: true },
  ]);
}

/** Elements that stick out past the right edge, outside anything that scrolls sideways. */
async function overflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= width + 1) return [];
    const scrolls = (el: Element | null): boolean => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const x = getComputedStyle(e).overflowX;
        if (x === "auto" || x === "scroll" || x === "hidden" || x === "clip") return true;
      }
      return false;
    };
    return [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > width + 1 && !scrolls(el.parentElement);
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].slice(0, 4).join(".")} (right edge ${Math.round(el.getBoundingClientRect().right)} px)`);
  });
}

for (const market of REVIEW_MARKETS) {
  test.describe(`customer in ${market}`, () => {
    for (const spec of PAGES.filter((p) => p.audience === "customer")) {
      test(`${spec.name} fits a phone`, async ({ page, context, baseURL }) => {
        test.skip(market !== "bw" && spec.path.endsWith(":"), "Only the demo customer has this.");
        await signInAs(context, await reviewCustomer(market), baseURL!);
        const path = await resolvePath(page, spec, baseURL!);
        test.skip(!path, `Nothing to open for ${spec.name} in ${market}.`);
        await page.goto(path!);
        expect(new URL(page.url()).pathname, "stayed signed in").not.toMatch(/sign-in/);
        await settled(page);
        expect(await overflow(page), `${path} at 390 px in ${market}`).toEqual([]);
      });
    }
  });
}

test.describe("staff", () => {
  for (const spec of PAGES.filter((p) => p.audience === "staff")) {
    test(`${spec.name} fits a phone`, async ({ page, context, baseURL }) => {
      await signInAs(context, DEMO_STAFF, baseURL!);
      const path = await resolvePath(page, spec, baseURL!);
      test.skip(!path, `Nothing to open for ${spec.name}.`);
      await page.goto(path!);
      await settled(page);
      expect(await overflow(page), `${path} at 390 px`).toEqual([]);
    });
  }
});
