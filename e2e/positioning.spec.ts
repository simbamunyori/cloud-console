import { expect, test } from "@playwright/test";
import { settled } from "./support/pages";

/**
 * docs/STRATEGY_ROLLOUT.md, U2: the navy theme is the default and a
 * visitor's choice is remembered; the supporting line sits under the
 * headline and opens the search description; Who we help stays hidden
 * until a Publisher approves it; pictures of real screens keep a white
 * panel in both themes.
 */
const SUPPORTING = "One account. One team. Cloud, security, resilience and connectivity, handled.";

test.describe("positioning and the dark theme", () => {
  test.use({ colorScheme: "light" });

  test("a first visit gets the navy theme, whatever the device prefers", async ({ page }) => {
    await page.goto("/bw");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("a visitor who picks light keeps it on the next page", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/bw");
    await settled(page);
    await page.locator("footer").getByRole("radio", { name: "Light" }).check({ force: true });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect((await context.cookies()).find((c) => c.name === "theme")?.value).toBe("light");
    await page.goto("/bw/pricing");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("the supporting line is under the headline and opens the search description", async ({ page }) => {
    await page.goto("/bw");
    await expect(page.getByText(SUPPORTING, { exact: true })).toBeVisible();
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toMatch(new RegExp(`^${SUPPORTING.replace(/\./g, "\\.")}`));
  });

  test("Who we help stays hidden until a Publisher approves it", async ({ page }) => {
    await page.goto("/bw");
    await expect(
      page.getByRole("heading", {
        name: "Built for businesses of 10 to 150 people.",
      }),
    ).toHaveCount(0);
  });

  test("the email signature keeps a white panel in the navy theme", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/bw#email");
    await settled(page);
    const panel = page.locator("#email [data-surface='light']").first();
    await panel.scrollIntoViewIfNeeded();
    expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
  });
});
