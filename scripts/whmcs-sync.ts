/**
 * npm run whmcs:sync                         shows what would change in WHMCS
 * npm run whmcs:sync -- --apply --staff you@fourthgen.co.bw
 *                                            makes the changes, as that staff member
 *
 * Puts the approved price books into WHMCS: product groups, products and
 * their monthly prices per currency (through the sync addon), and domain
 * ending prices. See docs/whmcs-setup.md, section 6.
 */
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { requireSecret, secret } from "@/server/secrets";
import { WhmcsClient } from "@/server/billing/whmcs/client";
import { describeReport, runSync, syncUrlFor } from "@/server/billing/whmcs/price-sync";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const staffEmail = args[args.indexOf("--staff") + 1];
  const e = env();
  if (!e.WHMCS_API_URL) throw new Error("Set WHMCS_API_URL first (docs/whmcs-setup.md, step 4).");

  let staff;
  if (apply) {
    if (!args.includes("--staff") || !staffEmail) throw new Error("--apply needs --staff and your staff email, for the audit log.");
    const user = await prisma.user.findUnique({ where: { email: staffEmail.toLowerCase() } });
    if (!user || user.kind !== "STAFF" || !user.staffRole || user.deactivatedAt) throw new Error(`${staffEmail} is not an active staff member.`);
    staff = { userId: user.id, name: user.name, staffRole: user.staffRole };
  }

  const whmcs = new WhmcsClient({ url: e.WHMCS_API_URL, identifier: requireSecret("WHMCS_API_IDENTIFIER"), secret: requireSecret("WHMCS_API_SECRET"), accessKey: secret("WHMCS_ACCESS_KEY") });
  const deps = { db: prisma, whmcs, syncUrl: e.WHMCS_SYNC_URL ?? syncUrlFor(e.WHMCS_API_URL), syncSecret: requireSecret("WHMCS_SYNC_SECRET") };
  const report = await runSync(deps, staff ? { apply: true, staff } : { apply: false });
  console.log(describeReport(report).join("\n"));
  if (report.plan.problems.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
