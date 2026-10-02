import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/signed-in";

/**
 * Milestone 10's launch purchases, end to end: a domain found on the site
 * and registered from the console, Microsoft 365 set up by hand by staff,
 * and an invoice paid by bank transfer and confirmed by finance.
 */

async function orderReference(page: Page) {
  await expect(page).toHaveURL(/\/app\/orders\/ORD-[A-Z0-9]+\?new=1/);
  await expect(page.getByText("Thanks, your order is in.")).toBeVisible();
  return /ORD-[A-Z0-9]+/.exec(page.url())![0];
}

async function finishTask(page: Page, reference: string) {
  await page.goto("/admin/tasks");
  await page.waitForLoadState("networkidle");
  const task = page.getByRole("region").filter({ hasText: reference });
  await expect(task).toHaveCount(1);
  await task.getByRole("button", { name: "Mark as done" }).click();
  // Done tasks leave the to-do list; the customer's pages show the result.
  await expect(task).toHaveCount(0);
}

test("a domain, Microsoft 365 and a bank transfer go through from the site to staff", async ({ page, context, browser, baseURL }) => {
  test.slow();
  const domain = `e2e-${Date.now().toString(36)}.co.bw`;
  const staff = await browser.newContext();
  await signIn(staff, "staff", baseURL!);
  const desk = await staff.newPage();

  // A visitor finds the domain on the site and puts it in the cart.
  await page.goto(`/bw?domain=${domain}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: `Add ${domain} to your cart` }).click();
  await expect(page.getByText("1 domain in your cart")).toBeVisible();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  await expect(page.getByText(domain)).toBeVisible();

  // They sign in and register it from the console's cart.
  await signIn(context, "customer", baseURL!);
  await page.goto("/app/cart");
  await page.waitForLoadState("networkidle");
  const row = page.getByRole("listitem").filter({ hasText: domain });
  const start = row.getByRole("checkbox", { name: /Start this service now/ });
  if (await start.count()) await start.check();
  await row.getByRole("button", { name: "Register" }).click();
  const domainOrder = await orderReference(page);
  await expect(page.getByRole("main").getByText("Being set up", { exact: true })).toBeVisible();

  // Staff register it with the registry and finish the task: it is active.
  await finishTask(desk, domainOrder);
  await page.goto("/app/services");
  await expect(page.getByRole("region", { name: "Domains" }).getByRole("listitem").filter({ hasText: domain })).toContainText("Active");

  // Microsoft 365 Business Standard for three people, set up by hand.
  await page.goto("/app/marketplace/microsoft-365-business-standard");
  await page.waitForLoadState("networkidle");
  const order = page.getByRole("region", { name: "Order" });
  await order.getByLabel("How many users?").fill("3");
  await order.getByLabel("Your email domain").fill(domain);
  const startM365 = order.getByRole("checkbox", { name: /Start this service now/ });
  if (await startM365.count()) await startM365.check();
  await order.getByRole("button", { name: /^Order for .* a month$/ }).click();
  const m365Order = await orderReference(page);
  await page.getByRole("link", { name: "View the invoice" }).click();
  await expect(page).toHaveURL(/\/app\/billing\/invoices\//);
  const invoice = /INV-[0-9-]+/.exec((await page.getByRole("heading", { level: 1 }).textContent()) ?? "")?.[0] ?? "";
  expect(invoice).toMatch(/^INV-/);

  await finishTask(desk, m365Order);
  await page.goto(`/app/orders/${m365Order}`);
  await expect(page.getByText("Everything is set up.")).toBeVisible();
  await page.goto("/app/services");
  await expect(page.getByRole("link").filter({ hasText: domain }).filter({ hasText: "3 users" })).toContainText("Active");

  // The customer pays the Microsoft 365 invoice by bank transfer and tells us.
  await page.goto(`/app/orders/${m365Order}`);
  await page.getByRole("link", { name: "View the invoice" }).click();
  const pay = page.getByRole("region", { name: /^Pay / });
  await expect(pay.getByRole("heading", { name: "Pay by bank transfer (EFT)" })).toBeVisible();
  await expect(pay).toContainText(invoice);
  await page.waitForLoadState("networkidle");
  await page.getByText("Already paid by bank transfer? Tell us").click();
  await page.getByRole("button", { name: "Tell us you've paid" }).click();
  await expect(page.getByText(/You told us on .* that you paid .* by bank transfer/)).toBeVisible();

  // Finance finds it in the bank and confirms it: the invoice is paid.
  await desk.goto("/admin/payments");
  await desk.waitForLoadState("networkidle");
  const payment = desk.locator("section").filter({ hasText: `for invoice ${invoice}` });
  await payment.getByRole("button", { name: "It's in the bank: confirm" }).click();
  // Confirmed payments leave the list to check.
  await expect(payment).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(`Bank transfer, reference ${invoice}`)).toBeVisible();
  await expect(page.getByRole("region", { name: /^Pay / })).toHaveCount(0);
  await staff.close();
});
