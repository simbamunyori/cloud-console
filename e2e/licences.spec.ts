import { expect, test } from "@playwright/test";
import { signIn } from "./support/signed-in";

/**
 * Users and licences on the demo tenant: 12 Business Standard licences,
 * 10 held. The customer gives a spare one to the new starter and takes it
 * back again, so the demo keeps its two unused licences. The demo server
 * runs the stub tenant provider, so changes apply at once.
 */
test("a customer sees unused licences and gives one out", async ({ page, context, baseURL }) => {
  await signIn(context, "customer", baseURL!);
  await page.goto("/app");
  await expect(page.getByText("2 unused Microsoft 365 Business Standard licences")).toBeVisible();

  await page.getByRole("link", { name: "Users and licences" }).first().click();
  await expect(page.getByRole("heading", { name: "Users and licences", level: 1 })).toBeVisible();
  await expect(page.getByText("10 of 12 in use")).toBeVisible();
  await expect(page.getByText("2 unused", { exact: true })).toBeVisible();

  const row = page.getByRole("listitem").filter({ hasText: "refilwe@kgalehill.co.bw" });
  await expect(row.getByText("No licence")).toBeVisible();
  await row.getByRole("button", { name: "Manage" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Give" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("11 of 12 in use")).toBeVisible();
  await expect(row.getByText("Microsoft 365 Business Standard")).toBeVisible();

  await row.getByRole("button", { name: "Manage" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Take back" }).click();
  await expect(page.getByText("10 of 12 in use")).toBeVisible();
});

test("staff see a customer's tenant", async ({ page, context, baseURL }) => {
  await signIn(context, "staff", baseURL!);
  await page.goto("/admin/customers");
  await page.getByRole("link", { name: /Kgale Hill Logistics/ }).first().click();
  await expect(page.getByRole("heading", { name: "Microsoft 365 and Google Workspace" })).toBeVisible();
  await page.getByRole("link", { name: "Users and licences" }).click();
  await expect(page.getByRole("heading", { name: "Microsoft 365, kgalehill.co.bw" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Microsoft 365 Business Standard/ })).toContainText("12");
});
