import { expect, test } from "@playwright/test";
import { signIn } from "./support/signed-in";

/** The website editor (Payload) at /admin/content, for staff with a website role. */

test("the website editor opens for a signed-in admin, with the staff console one click away", async ({ page, context, baseURL }) => {
  await signIn(context, "staff", baseURL!);
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/admin/content");
  await expect(page.getByRole("link", { name: /Media library/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the staff console" })).toBeAttached();
  // Nothing blocked by the content security policy.
  expect(errors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
});

test("the website editor sends visitors to the staff sign-in", async ({ page }) => {
  await page.goto("/admin/content");
  await expect(page).toHaveURL(/\/admin\/sign-in/);
});

test("the editor's API refuses anyone who isn't signed in as staff", async ({ request }) => {
  const res = await request.post("/admin/content-api/staff", { data: { consoleUserId: "x", name: "x", email: "x@example.co.bw", websiteRole: "PUBLISHER" } });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  const me = await request.get("/admin/content-api/staff/me");
  expect((await me.json()).user).toBeNull();
});
