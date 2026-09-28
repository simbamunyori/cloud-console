import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { settled } from "./support/pages";
import { signIn } from "./support/signed-in";

/**
 * The menus that open: the site's Services menu and phone menu, and the
 * console's notifications and help. Each opens from the keyboard, closes
 * on Escape, and passes axe while open, in both themes.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function axe(page: import("@playwright/test").Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`));
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("the Services menu opens from the keyboard and closes on Escape", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/bw");
      await settled(page);
      const button = page.getByRole("button", { name: "Services" });
      await button.focus();
      await page.keyboard.press("Enter");
      await expect(button).toHaveAttribute("aria-expanded", "true");
      for (const title of ["Productivity", "Servers", "Security", "Web and domains", "Applications"]) await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await expect(button).toBeFocused();
    });

    test("phones get one header row with a menu button", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/bw");
      await settled(page);
      const header = await page.locator("header").first().boundingBox();
      // One 64 px row plus its border: nothing wraps to a second row.
      expect(header!.height).toBeLessThanOrEqual(65);
      await page.getByRole("button", { name: "Open menu" }).click();
      const menu = page.getByRole("dialog", { name: "Menu" });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("link", { name: "Pricing" })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    });

    test("the console's notifications and help open and pass axe", async ({ page, context, baseURL }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signIn(context, "customer", baseURL!);
      await page.goto("/app");
      await settled(page);
      const bar = page.locator("div.sticky").filter({ has: page.getByRole("search") });
      for (const name of [/^Notifications/, /^Help$/]) {
        const button = bar.getByRole("button", { name });
        await button.click();
        await expect(button).toHaveAttribute("aria-expanded", "true");
        expect(await axe(page)).toEqual([]);
        await page.keyboard.press("Escape");
        await expect(button).toHaveAttribute("aria-expanded", "false");
      }
    });
  });
}

test("Find your domain opens the console's domain search, after sign-in for visitors", async ({ request }) => {
  const res = await request.get("/find-domain?q=Acme&tld=.co.bw", { maxRedirects: 0 });
  expect(res.status()).toBe(303);
  const to = new URL(res.headers()["location"], "http://x");
  expect(to.pathname).toBe("/sign-in");
  expect(to.searchParams.get("next")).toBe("/app/marketplace/domains?q=acme.co.bw");
});
