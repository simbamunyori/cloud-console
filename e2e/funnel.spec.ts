import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signIn } from "./support/signed-in";

/**
 * The free tools, follow-up emails and pre-sales bookings (final build,
 * Milestone 8). The email check answers from fixed records (TOOLS_DEMO=yes):
 * "secure.example" passes, any other domain lacks DMARC and DKIM.
 */

test.describe.configure({ mode: "serial" });

const stamp = () => Date.now().toString(36);

// Thapelo opens on desktop and would sit over the forms.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("thapelo", "closed"));
});

test("the email check explains each gap and emails the report", async ({ page }) => {
  await page.goto("/bw/tools");
  await page.getByRole("link", { name: /Email security check/ }).click();
  await page.getByLabel("Your domain").fill("https://www.kgale-demo.example/");
  await page.getByRole("button", { name: "Check my domain" }).click();
  await expect(page).toHaveURL(/domain=/);
  await expect(page.getByRole("heading", { name: "Report for kgale-demo.example" })).toBeVisible();
  await expect(page.getByText(/things? needs? attention/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "We can fix it for you" })).toBeVisible();

  const form = page.getByRole("form", { name: "Email me this report" });
  await form.getByLabel("Work email").fill(`mpho-${stamp()}@example.co.bw`);
  await form.getByRole("button", { name: "Email me the report" }).click();
  await expect(form.getByText("Tick the box so we may email you.")).toBeVisible();
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Email me the report" }).click();
  await expect(page.getByRole("status")).toContainText("Sent");

  await page.goto("/bw/tools/email-security?domain=secure.example");
  await expect(page.getByText("Everything we check is in order.")).toBeVisible();
});

test("the cost calculator recommends a plan and hands the order to sign-up", async ({ page }) => {
  await page.goto("/bw/tools/cost-calculator");
  await page.getByLabel("How many people need an account?").fill("12");
  await page.getByRole("button", { name: "Work out my cost" }).click();
  await expect(page).toHaveURL(/users=12/);
  const result = page.getByRole("region", { name: "We recommend" });
  await expect(result).toContainText("a month for 12 people");
  const order = result.getByRole("link", { name: /^Order / });
  await expect(order).toHaveAttribute("href", /\/sign-up\?next=%2Fapp%2Fmarketplace%2F[a-z0-9-]+%3Fquantity%3D12/);
  await order.click();
  await expect(page).toHaveURL(/\/sign-up\?next=/);
});

test("the readiness checklist scores the answers and keeps the result at its own link", async ({ page }) => {
  await page.goto("/bw/tools/data-protection");
  await page.getByRole("button", { name: "See my score" }).click();
  await expect(page.getByText("Answer every question first.").first()).toBeVisible();
  const radios = page.locator('input[type="radio"][value="partly"]');
  for (let i = 0; i < (await radios.count()); i++) await radios.nth(i).check();
  await page.locator('input[type="radio"][name="inventory"][value="yes"]').check();
  await page.getByRole("button", { name: "See my score" }).click();
  await expect(page).toHaveURL(/\/bw\/tools\/data-protection\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("out of 100");
  await expect(page.getByRole("heading", { name: "Your next steps" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open a free account to download" })).toBeVisible();
});

test("a visitor books a call, staff see it, and the visitor can cancel", async ({ page, baseURL, browser }) => {
  test.slow();
  const name = `Neo ${stamp()}`;
  const email = `neo-${stamp()}@example.co.bw`;
  await page.goto("/bw/book?topic=email-check");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Book the call" }).click();
  await expect(page.getByText("Check the highlighted fields.")).toBeVisible();
  // The last day and time on offer, so earlier runs rarely take it.
  await page.locator('input[name="day"]').last().check();
  await page.locator('input[name="start"]').last().check();
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Your name" }).fill(name);
  await main.getByRole("textbox", { name: "Work email" }).fill(email);
  await main.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Book the call" }).click();
  const booked = page.getByRole("status");
  await expect(booked).toContainText("Your call is booked");
  const reference = (await booked.textContent())!.match(/CALL-[A-Z0-9]+/)![0];

  const staff = await browser.newContext();
  await signIn(staff, "staff", baseURL!);
  const desk = await staff.newPage();
  await desk.goto("/admin/bookings");
  await expect(desk.getByText(reference)).toBeVisible();
  await desk.goto("/admin/leads?source=BOOKING");
  await expect(desk.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await staff.close();

  // The invite's cancel link carries a fresh token; set one the test knows.
  const db = new PrismaClient();
  try {
    const { hashToken, newToken } = await import("../src/server/auth/tokens");
    const token = newToken();
    await db.presalesBooking.update({ where: { reference }, data: { cancelTokenHash: hashToken(token) } });
    await page.goto(`/bw/book/cancel/${token}`);
    await page.getByRole("button", { name: "Cancel the call" }).click();
    await expect(page.getByRole("status")).toContainText("cancelled");
    expect((await db.presalesBooking.findUniqueOrThrow({ where: { reference } })).status).toBe("CANCELLED");
  } finally {
    await db.$disconnect();
  }
});

test("a lead stops the follow-up emails from the link in them", async ({ page }) => {
  const db = new PrismaClient();
  try {
    const lead = await db.lead.findFirst({ where: { followUpStoppedAt: null, unsubscribeToken: { not: null } }, orderBy: { createdAt: "desc" } });
    test.skip(!lead, "No lead with follow-ups yet");
    await page.goto(`/${lead!.market}/unsubscribe/${lead!.unsubscribeToken}`);
    await page.getByRole("button", { name: "Stop the emails" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead!.id } })).followUpStoppedAt).not.toBeNull();
  } finally {
    await db.$disconnect();
  }
});
