import { expect, test } from "@playwright/test";
import { signIn } from "./support/signed-in";

/**
 * Cloud spend on the demo organisation: six months of invoices, two
 * months of Azure usage with test servers switched off ten days ago, and
 * a saving staff found. Nothing here changes the demo.
 */
test("a customer sees spend by month, picks a month, and sees ways to save", async ({ page, context, baseURL }) => {
  await signIn(context, "customer", baseURL!);
  await page.goto("/app");
  await expect(page.getByText("2 ways to spend less on Azure")).toBeVisible();

  await page.getByRole("link", { name: "Cloud spend" }).first().click();
  await expect(page.getByRole("heading", { name: "Cloud spend", level: 1 })).toBeVisible();
  await expect(page.getByText(/^Forecast for /)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Where it went in / })).toBeVisible();
  await expect(page.getByText("Servers in kgale-test look switched off")).toBeVisible();
  await expect(page.getByText("The ERP server is bigger than it needs to be")).toBeVisible();
  await expect(page.getByText("2 unused Microsoft 365 Business Standard licences")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ask us to do it/ })).toHaveCount(2);

  // Choosing last month's bar shows last month's breakdown.
  const bars = page.getByRole("list").filter({ has: page.locator('a[href*="?month="]') }).getByRole("link");
  const last = bars.nth((await bars.count()) - 2);
  const month = (await last.getAttribute("aria-label"))!.split(":")[0];
  await last.click();
  await expect(page.getByRole("heading", { name: `Where it went in ${month}` })).toBeVisible();
  await expect(page.getByRole("heading", { name: `Where it went in ${month}` }).locator("xpath=ancestor::section[1]")).toContainText("Azure usage");

  await page.getByText("Show as a table").click();
  await expect(page.getByRole("row", { name: new RegExp(month) })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Azure usage in / })).toBeVisible();
  await expect(page.getByRole("cell", { name: "kgale-erp" })).toBeVisible();
});

test("staff upload a usage file and see what didn't match", async ({ page, context, baseURL }) => {
  await signIn(context, "staff", baseURL!);
  await page.goto("/admin/customers");
  await page.getByRole("link", { name: /Kgale Hill Logistics/ }).first().click();
  await page.getByRole("link", { name: "Cloud spend" }).click();
  await expect(page.getByText("3f2b8c1e-0a4d-4b7e-9c61-2d5e8f7a1b90")).toBeVisible();
  await expect(page.getByText("Found in usage", { exact: false })).toBeVisible();

  await page.getByRole("link", { name: "Upload usage" }).click();
  await expect(page.getByRole("heading", { name: "Azure usage", level: 1 })).toBeVisible();
  await page.getByLabel("Usage file (CSV)").setInputFiles({
    name: "stranger.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("EntitlementId,UsageDate,MeterCategory,BillingPreTaxTotal,BillingCurrency\n00000000-0000-4000-8000-000000000000,2026-09-01,Storage,1.00,USD\n"),
  });
  await page.getByRole("button", { name: "Import usage" }).click();
  await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: "Imported 0 of 1 rows" })).toBeVisible();
  await expect(page.getByText(/Not linked to any customer/).first()).toBeVisible();
});
