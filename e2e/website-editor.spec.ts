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

test("the preview shows staff the latest draft, while visitors keep the published page", async ({ page, context, baseURL, browser }) => {
  await signIn(context, "staff", baseURL!);
  const slug = `e2e-preview-${Date.now()}`;
  const hero = (heading: string) => [{ blockType: "hero", heading, domainSearch: false, picture: { source: "console-home" } }];
  const created = await page.request.post("/admin/content-api/pages?locale=bw", { data: { title: "Preview check", slug, layout: hero("The published heading"), _status: "published" } });
  expect(created.ok(), await created.text()).toBe(true);
  const { doc } = await created.json();
  try {
    expect((await page.request.patch(`/admin/content-api/pages/${doc.id}?draft=true&locale=bw`, { data: { layout: hero("A draft heading") } })).ok()).toBe(true);
    await page.goto(`/preview?path=/bw/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/bw/${slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("A draft heading");

    const visitor = await browser.newPage();
    await visitor.goto(`${baseURL}/bw/${slug}`);
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("The published heading");
    await visitor.close();
  } finally {
    await page.request.delete(`/admin/content-api/pages/${doc.id}`);
  }
});

test("the preview is for website staff only", async ({ request }) => {
  expect((await request.get("/preview?path=/bw", { maxRedirects: 0 })).status()).toBe(404);
});

test("a page opens in the editor with its sections", async ({ page, context, baseURL }) => {
  await signIn(context, "staff", baseURL!);
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const found = await page.request.get("/admin/content-api/pages?where[slug][equals]=home&depth=0");
  await page.goto(`/admin/content/collections/pages/${(await found.json()).docs[0].id}`);
  await expect(page.getByRole("heading", { name: /^Sections/ })).toBeVisible();
  // The live preview frames the page itself, in draft mode.
  // Clicked again until the editor has loaded enough to open it.
  await expect(async () => {
    if (await page.getByRole("button", { name: "Live Preview" }).isVisible()) await page.getByRole("button", { name: "Live Preview" }).click();
    await expect(page.getByRole("button", { name: "Exit Live Preview" })).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await expect(page.frameLocator("iframe").first().getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
});
