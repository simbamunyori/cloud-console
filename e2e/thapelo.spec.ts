import { expect, test } from "@playwright/test";
import { signIn } from "./support/signed-in";

/**
 * Thapelo on the public site, with the scripted demo model
 * (SALES_ASSISTANT_DEMO=yes): open on desktop, a bubble on phones, answers
 * from the real tools, and Talk to a person reaches staff as a lead.
 */

test.describe.configure({ mode: "serial" });

test("Thapelo answers, hands over to a person, and staff see the lead", async ({ page, baseURL, browser }) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/bw");
  const panel = page.getByRole("complementary", { name: "Thapelo, your AI assistant" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Your AI assistant")).toBeVisible();

  await panel.getByLabel("Ask a question").fill("Is kgalelogistics.co.bw free?");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(panel.getByRole("log")).toContainText(/kgalelogistics\.co\.bw is (free|taken)/);

  const company = `Kgale ${Date.now().toString(36)}`;
  await panel.getByRole("button", { name: "Talk to a person" }).click();
  const form = panel.getByRole("form", { name: "Talk to a person" });
  await form.getByLabel("Name", { exact: true }).fill("Kagiso Molefe");
  await form.getByLabel("Email", { exact: true }).fill("kagiso@example.co.bw");
  await form.getByLabel("Company (optional)").fill(company);
  await form.getByRole("button", { name: "Send to our team" }).click();
  await expect(form.getByText("Tick the box so we may contact you.")).toBeVisible();
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Send to our team" }).click();
  await expect(panel.getByRole("status")).toContainText("Someone from our team will contact you");
  const reference = (await panel.getByRole("status").textContent())!.match(/LEAD-[A-Z0-9]+/)![0];

  // The chat follows the visitor to another page.
  await page.goto("/bw/pricing");
  await expect(panel.getByRole("log")).toContainText("Is kgalelogistics.co.bw free?");

  // Minimising is remembered.
  await panel.getByRole("button", { name: "Minimise Thapelo" }).click();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Chat with Thapelo" })).toBeVisible();
  await expect(panel).toBeHidden();

  const staff = await browser.newContext();
  await signIn(staff, "staff", baseURL!);
  const desk = await staff.newPage();
  await desk.goto("/admin/leads");
  await desk.getByRole("link", { name: new RegExp(company) }).click();
  await expect(desk).toHaveURL(new RegExp(`/admin/leads/${reference}`));
  await expect(desk.getByLabel("The conversation").getByText("Is kgalelogistics.co.bw free?")).toBeVisible();
  await expect(desk.getByText(/Looked up: check_domain/)).toBeVisible();
  await desk.getByRole("button", { name: "Mark contacted" }).click();
  await expect(desk.getByText("Marked contacted.")).toBeVisible();
  await staff.close();
});

test("on a phone Thapelo waits as a bubble", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/bw");
  await expect(page.getByText("Questions? Ask Thapelo")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Thapelo, your AI assistant" })).toBeHidden();
  await page.getByRole("button", { name: "Chat with Thapelo" }).click();
  await expect(page.getByRole("complementary", { name: "Thapelo, your AI assistant" })).toBeVisible();
});
