import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { signIn } from "./support/signed-in";

/**
 * The definition of done for Milestone 9b: staff upload Odoo exports, check
 * the dry run, approve it, and the customer is brought over at their Odoo
 * price and due date, with the welcome email held until the cutover date.
 */
test("Odoo clients come over through the dry run", async ({ browser, baseURL }) => {
  test.slow();
  const db = new PrismaClient();
  try {
    const run = Date.now().toString(36);
    const ref = `__export__.res_partner_e2e_${run}`;
    const email = `e2e-${run}@example.co.bw`;
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const files = {
      customers: `ID,Name,Email,Country\n${ref},Mmadinare Bakery ${run},${email},Botswana\n`,
      services: [
        "Order Reference,Customer/ID,Recurring Plan,Next Invoice,Currency,Status,Order Lines/Product,Order Lines/Quantity,Order Lines/Unit Price,Hosted at,Server or account",
        `SUB/E2E/${run},${ref},Monthly,${day(20)},BWP,In Progress,Old bakery website care,1,275.00,Contabo,vps-e2e`,
      ].join("\n"),
    };

    const staff = await browser.newContext();
    await signIn(staff, "staff", baseURL!);
    const page = await staff.newPage();
    await page.goto("/admin/migration");
    await page.getByLabel("Customers (CSV)").setInputFiles({ name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(files.customers) });
    await page.getByLabel("Subscriptions (CSV)").setInputFiles({ name: "subscriptions.csv", mimeType: "text/csv", buffer: Buffer.from(files.services) });
    await page.getByRole("button", { name: "Read the files" }).click();

    // The dry run shows the customer and the unmatched product as a legacy service.
    await expect(page.getByText(`Mmadinare Bakery ${run}`, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Bring Old bakery website care over as")).toBeVisible();
    await page.getByRole("button", { name: "Approve and import" }).click();

    // The import runs in the background.
    await expect
      .poll(async () => latestStatus(db), { timeout: 120_000, intervals: [2_000] })
      .toBe("IMPORTED");

    const profile = await db.serviceProfile.findFirstOrThrow({ where: { source: `Odoo SUB/E2E/${run}` } });
    expect(profile.hostedAt).toBe("CONTABO");
    expect(profile.legacyRecurringMinor).not.toBeNull();

    // Welcome emails wait for the cutover date.
    await page.reload();
    await page.getByLabel("Send the welcome emails on").fill(day(7));
    await page.getByRole("button", { name: "Save the cutover date" }).click();
    await expect(page.getByRole("status").filter({ hasText: /./ }).first()).toBeVisible();
    const batch = await db.migrationBatch.findFirstOrThrow({ where: { status: "IMPORTED" }, orderBy: { createdAt: "desc" } });
    expect(batch.cutoverOn?.toISOString().slice(0, 10)).toBe(day(7));
    expect(batch.welcomeSentAt).toBeNull();
  } finally {
    await db.$disconnect();
  }
});

async function latestStatus(db: PrismaClient) {
  return (await db.migrationBatch.findFirst({ orderBy: { createdAt: "desc" }, select: { status: true } }))?.status;
}
