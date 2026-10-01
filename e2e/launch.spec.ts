import { expect, test } from "@playwright/test";
import { signIn } from "./support/signed-in";

/**
 * Milestone 7 on the demo data: the approved product page, the Insights
 * page with its topics, a visit through a tracked link, and the kit and
 * newsletter in the staff console.
 */

test("an approved product page shows the catalogue, the price and the questions", async ({ page }) => {
  await page.goto("/bw/products/microsoft-365-business-standard");
  await expect(page.getByRole("heading", { level: 1, name: "Microsoft 365 Business Standard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who it is for" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is included" })).toBeVisible();
  await expect(page.getByText(/per user a month/)).toBeVisible();
  await page.getByText("Can we add people later?").click();
  await expect(page.getByText(/Add or remove people from your console/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Order now" })).toHaveAttribute("href", /sign-in\?next=%2Fapp%2Fmarketplace%2Fmicrosoft-365-business-standard/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/api\/share\/microsoft-365-business-standard/);
  const image = await page.request.get("/api/share/microsoft-365-business-standard");
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("a product without an approved page has none", async ({ page }) => {
  const res = await page.goto("/bw/products/managed-vps-small");
  expect(res?.status()).toBe(404);
});

test("the Insights page lists articles and narrows them by topic", async ({ page }) => {
  await page.goto("/bw/insights");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const topics = page.getByRole("navigation", { name: "Topics" });
  await topics.getByRole("link", { name: "Resilience" }).click();
  await expect(page).toHaveURL(/topic=resilience/);
  await expect(page.getByRole("heading", { name: /A backup you haven.t restored/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why we offer Microsoft 365 Business Standard" })).toHaveCount(0);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Insights" })).toBeVisible();
});

test("a visit through a tracked link is remembered for its campaign", async ({ page, context }) => {
  await page.goto("/bw/products/microsoft-365-business-standard?utm_source=linkedin&utm_medium=social&utm_campaign=launch-microsoft-365-business-standard");
  const stored = async () => decodeURIComponent((await context.cookies()).find((c) => c.name.endsWith("console_campaign"))?.value ?? "");
  await expect.poll(stored).toBe("launch-microsoft-365-business-standard|linkedin|social");
});

test("staff see the kit's tracked links and the newsletter issue", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await signIn(context, "staff", baseURL!);
  const page = await context.newPage();
  await page.goto("/admin/launch-kits");
  await page.getByRole("link", { name: /Microsoft 365 Business Standard/ }).click();
  await expect(page.getByRole("heading", { name: "Tracked links" })).toBeVisible();
  await expect(page.getByText(/utm_campaign=launch-microsoft-365-business-standard/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy the post" })).toBeVisible();
  await page.goto("/admin/newsletter");
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await context.close();
});
