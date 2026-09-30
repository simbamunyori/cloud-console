import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signIn } from "./support/signed-in";
import { DEMO_CUSTOMER, testSession } from "./support/sessions";

/**
 * Passkeys with Chromium's virtual authenticator, which stands in for a
 * fingerprint reader: the customer adds one, signs out, signs straight back
 * in with it (a passkey is both steps). The demo customer has no
 * authenticator app, so the passkey is now their second step and can't be
 * removed until there is another; the test then tidies it away.
 */
test.describe.configure({ mode: "serial" });

test("a customer adds a passkey, signs in with it alone, and keeps it while it is their only second step", async ({ page, context, baseURL }) => {
  // Start clean, in case an earlier run stopped half way.
  const db = new PrismaClient();
  const tidy = () => db.passkey.deleteMany({ where: { user: { email: DEMO_CUSTOMER } } });
  await tidy();

  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  await signIn(context, "customer", baseURL!);
  await page.goto("/app/security");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText("Passkey added.")).toBeVisible();
  await expect(page.getByText(/^Passkey on /)).toBeVisible();

  await context.clearCookies();
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await page.waitForURL(/\/app$/);

  await page.goto("/app/security");
  await expect(page.getByText(/with passkey/).first()).toBeVisible();
  await page.getByRole("button", { name: /^Remove Passkey on / }).click();
  await expect(page.getByText("This passkey is your second step. Set up an authenticator app or add another passkey first.")).toBeVisible();
  await tidy();
  await db.$disconnect();
});

test("a sensitive action asks for a passkey or code when the last check is old", async ({ page, context, baseURL }) => {
  const { name, value } = await testSession(DEMO_CUSTOMER, { confirmed: false });
  await context.addCookies([
    { name, value, url: baseURL! },
    { name: `__Host-${name}`, value, url: baseURL!.replace(/^http:/, "https:"), secure: true },
  ]);
  await page.goto("/app/team");
  await page.getByLabel("Email").first().fill("new.starter@kgalehill.co.bw");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await page.waitForURL(/\/app\/confirm\?next=%2Fapp%2Fteam/);
  await expect(page.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();
  await page.getByRole("link", { name: "Go back" }).click();
  await page.waitForURL(/\/app\/team$/);
});
