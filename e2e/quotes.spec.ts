import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashToken, newToken } from "../src/server/auth/tokens";
import { signIn } from "./support/signed-in";

/**
 * The definition of done for quotes: someone without an account asks on
 * the website, staff price it and send it, and a customer accepts it from
 * the link, which places an order at the quoted price.
 */
test("a quote goes from the website to an order", async ({ page, baseURL, browser }) => {
  test.slow();
  const db = new PrismaClient();
  try {
    const email = `e2e-${Date.now().toString(36)}@example.co.bw`;
    await page.goto("/bw/quote");
    await page.getByLabel("Your name", { exact: true }).fill("Mothusi Tau");
    await page.getByLabel("Company (optional)").fill("Tau Farms");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Phone").fill("+267 72 000 000");
    await page.getByLabel("Country", { exact: true }).selectOption("BW");
    await page.getByLabel("What do you need?").fill("Support for the farm office and two laptops in the field.");
    await page.getByRole("button", { name: "Ask for a quote" }).click();
    await expect(page.getByText("Thanks, we've got your request")).toBeVisible();
    const reference = (await page.getByRole("status").locator("span.font-semibold").textContent())!;
    expect(reference).toMatch(/^QUO-/);

    // Staff price it and send it.
    const staff = await browser.newContext();
    await signIn(staff, "staff", baseURL!);
    const desk = await staff.newPage();
    await desk.goto("/admin/quotes");
    await desk.getByRole("link", { name: /Tau Farms/ }).first().click();
    await expect(desk).toHaveURL(new RegExp(`/admin/quotes/${reference}`));
    await desk.getByLabel("Ordered as").selectOption({ label: "Managed support plan (Services)" });
    await desk.getByLabel("What", { exact: true }).fill("Support for the farm office");
    await desk.getByLabel("Price each").fill("1800");
    await desk.getByRole("button", { name: "Add a line" }).click();
    await desk.getByLabel("What", { exact: true }).nth(1).fill("Setting up the laptops");
    await desk.getByLabel("Charged").nth(1).selectOption("ONE_OFF");
    await desk.getByLabel("Price each").nth(1).fill("900");
    await desk.getByRole("button", { name: "Save and send" }).click();
    await expect(desk.getByText(/Sent\. The customer has the quote by email/)).toBeVisible();
    await staff.close();

    // The emailed link, as the email would carry it.
    const token = newToken();
    await db.quote.update({ where: { reference }, data: { tokenHash: hashToken(token) } });

    // Signed out, the link shows the quote and asks them to sign in.
    await page.goto(`/quote/${token}`);
    await expect(page.getByText("Support for the farm office")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in to accept" })).toBeVisible();

    // A customer accepts it in their account.
    const customer = await browser.newContext();
    await signIn(customer, "customer", baseURL!);
    const app = await customer.newPage();
    await app.goto(`/quote/${token}`);
    await app.getByRole("button", { name: /Review and accept in/ }).click();
    await expect(app).toHaveURL(new RegExp(`/app/quotes/${reference}`));
    const startNow = app.getByRole("checkbox", { name: /Start this service now/ });
    if (await startNow.count()) await startNow.check();
    await app.getByRole("button", { name: "Accept and order" }).click();
    await expect(app).toHaveURL(/\/app\/orders\/ORD-[A-Z0-9]+\?new=1/);
    await expect(app.getByText(`Quote`, { exact: true })).toBeVisible();
    await customer.close();

    const quote = await db.quote.findUniqueOrThrow({ where: { reference } });
    expect(quote.status).toBe("ACCEPTED");
    expect(quote.orderId).toBeTruthy();
  } finally {
    await db.$disconnect();
  }
});

test("the hidden field turns bots away without saving anything", async ({ page }) => {
  const email = `bot-${Date.now().toString(36)}@example.co.bw`;
  await page.goto("/bw/quote");
  await page.getByLabel("Your name", { exact: true }).fill("Bot");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Phone").fill("+267 72 000 000");
  await page.getByLabel("Country", { exact: true }).selectOption("BW");
  await page.getByLabel("What do you need?").fill("Cheap things for sale, visit my site.");
  await page.locator("#website").fill("https://spam.example", { force: true });
  await page.getByRole("button", { name: "Ask for a quote" }).click();
  await expect(page.getByText("Thanks, we've got your request")).toBeVisible();
  const db = new PrismaClient();
  try {
    expect(await db.quote.count({ where: { email } })).toBe(0);
  } finally {
    await db.$disconnect();
  }
});
