import { expect, test } from "@playwright/test";
import { signIn } from "./support/signed-in";

/**
 * The definition of done for the staff Catalogue: create a draft product,
 * price it, preview it and make it live, then find it in the marketplace.
 */
test("a new product goes from draft to the marketplace", async ({ page, context, baseURL, browser }) => {
  test.slow();
  await signIn(context, "staff", baseURL!);
  const slug = `e2e-firewall-${Date.now().toString(36)}`;
  const name = `Managed firewall ${slug.slice(-4)}`;

  await page.goto("/admin/catalogue/products/new?category=protection");
  await page.getByLabel("Address").fill(slug);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Summary").fill("A firewall at your office, watched by us.");
  await page.getByLabel("What's included").fill("Setup at your office\nRules kept up to date");
  await page.getByLabel("Cost per unit").fill("400");
  for (const market of ["South Africa", "Zimbabwe", "International"]) {
    const box = page.getByRole("checkbox", { name: market });
    if (await box.count()) await box.uncheck();
  }
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/catalogue/products/${slug}\\?added=1`));
  await expect(page.getByText("Added as a draft")).toBeVisible();

  // Not live without a price.
  await page.getByLabel("Status").selectOption("LIVE");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/Approve a price in BW/).first()).toBeVisible();

  // Price it on the Pricing page.
  await page.goto("/admin/pricing?market=bw");
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("button", { name: /Approve/ }).first().click();
  await expect(row.locator(".text-positive")).toBeVisible();

  // Preview it as a customer in Botswana would see it.
  await page.goto(`/admin/catalogue/products/${slug}/preview?market=bw`);
  await expect(page.getByText("customers don't see it yet")).toBeVisible();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  // Publish it.
  await page.goto(`/admin/catalogue/products/${slug}`);
  await page.getByLabel("Status").selectOption("LIVE");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/Saved 1 change/)).toBeVisible();

  const customer = await browser.newContext();
  await signIn(customer, "customer", baseURL!);
  const shop = await customer.newPage();
  await shop.goto("/app/marketplace");
  await expect(shop.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await customer.close();

  // Back to a draft, so the demo marketplace stays as it was.
  await page.getByLabel("Status").selectOption("DRAFT");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/Saved 1 change/)).toBeVisible();
});
