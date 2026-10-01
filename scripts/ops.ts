/**
 * Server commands, bundled into the production image as /app/ops.cjs.
 * On the server, run them through deploy/console:
 *
 *   console create-admin "Full Name" you@example.com
 *       asks for a password, then creates a staff Admin (who publishes the
 *       website too). They set up their authenticator at the first sign-in.
 *
 *   console whmcs-sync
 *       shows what would change in WHMCS: product groups, products and
 *       this month's approved prices (docs/whmcs-setup.md, section 6).
 *   console whmcs-sync --apply --staff you@fourthgeneration.technology
 *       makes those changes, as that staff member (audited).
 *
 *   node ops.cjs prestart
 *       run by deploy/deploy.sh before the app starts: loads the launch
 *       catalogue into a database with no products yet (no prices: staff
 *       approve those), fills SUPPORT_EMAIL into markets still on the
 *       development address, then lists anything else that would stop a
 *       production start.
 */
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";
import { loadLaunchCatalogue } from "@/server/catalogue/seed-data";
import { createAdmin, fillSupportEmail } from "@/server/ops/setup";
import { findPlaceholders } from "@/server/placeholders";
import { WhmcsClient } from "@/server/billing/whmcs/client";
import { describeReport, runSync, syncUrlFor } from "@/server/billing/whmcs/price-sync";

const db = new PrismaClient();

/** Reads a line without echoing it. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => {
      if (!muted) out.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function readAll(): Promise<string> {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "prestart") {
    if (await loadLaunchCatalogue(db)) console.log("Loaded the launch catalogue. Enter this month's exchange rates and approve the prices at /admin/pricing.");
    const changed = await fillSupportEmail(db, process.env.SUPPORT_EMAIL);
    if (changed.length) console.log(`Support email set for ${changed.join(", ")}.`);
    const e = process.env;
    const found = await findPlaceholders(db, {
      APP_URL: e.APP_URL ?? "http://localhost:3000",
      MAIL_FROM: e.MAIL_FROM ?? "no-reply@localhost",
      SMTP_URL: e.SMTP_URL || null,
      STATUS_PAGE_URL: e.STATUS_PAGE_URL,
      BILLING_ADAPTER: (e.BILLING_ADAPTER ?? "stub") as "stub" | "whmcs",
      TENANT_PROVIDER: (e.TENANT_PROVIDER ?? "stub") as "stub" | "manual",
      WHMCS_API_URL: e.WHMCS_API_URL,
      WHMCS_ENVIRONMENT: e.WHMCS_ENVIRONMENT as "test" | "production" | undefined,
      WHMCS_API_IDENTIFIER_SET: Boolean(e.WHMCS_API_IDENTIFIER),
      WHMCS_API_SECRET_SET: Boolean(e.WHMCS_API_SECRET),
    });
    if (found.length && e.ALLOW_PLACEHOLDERS !== "yes") {
      console.error(`The app will refuse to start until these are fixed (on the production server, most are lines in /opt/console/.env, see docs/deploy.md):\n${found.map((f) => `  - ${f}`).join("\n")}`);
      process.exitCode = 1;
    }
    return;
  }
  if (command === "create-admin") {
    const [name, email] = args;
    if (!name || !email) throw new Error('Usage: console create-admin "Full Name" you@example.com');
    let password: string;
    if (process.stdin.isTTY) {
      password = await askHidden("Password (12 characters or more): ");
      if ((await askHidden("Same password again: ")) !== password) throw new Error("The two passwords don't match. Nothing was created.");
    } else {
      // Piped in (scripts and CI): the first line is the password.
      password = (await readAll()).split(/\r?\n/)[0] ?? "";
    }
    const user = await createAdmin(db, { name, email, password });
    console.log(`Created ${user.name} (${user.email}) as a staff Admin. Sign in at ${process.env.APP_URL ?? ""}/admin/sign-in and set up your authenticator app.`);
    return;
  }
  if (command === "whmcs-sync") {
    const apply = args.includes("--apply");
    const staffEmail = args[args.indexOf("--staff") + 1];
    const e = process.env;
    if (!e.WHMCS_API_URL || !e.WHMCS_API_IDENTIFIER || !e.WHMCS_API_SECRET || !e.WHMCS_SYNC_SECRET) throw new Error("Set WHMCS_API_URL, WHMCS_API_IDENTIFIER, WHMCS_API_SECRET and WHMCS_SYNC_SECRET in /opt/console/.env first.");
    let staff;
    if (apply) {
      if (!args.includes("--staff") || !staffEmail) throw new Error("--apply needs --staff and your staff email, for the audit log.");
      const user = await db.user.findUnique({ where: { email: staffEmail.toLowerCase() } });
      if (!user || user.kind !== "STAFF" || !user.staffRole || user.deactivatedAt) throw new Error(`${staffEmail} is not an active staff member.`);
      staff = { userId: user.id, name: user.name, staffRole: user.staffRole };
    }
    const whmcs = new WhmcsClient({ url: e.WHMCS_API_URL, identifier: e.WHMCS_API_IDENTIFIER, secret: e.WHMCS_API_SECRET, accessKey: e.WHMCS_ACCESS_KEY || undefined });
    const report = await runSync({ db, whmcs, syncUrl: e.WHMCS_SYNC_URL ?? syncUrlFor(e.WHMCS_API_URL), syncSecret: e.WHMCS_SYNC_SECRET }, staff ? { apply: true, staff } : { apply: false });
    console.log(describeReport(report).join("\n"));
    if (report.plan.problems.length) process.exitCode = 1;
    return;
  }
  throw new Error("Commands: prestart, create-admin, whmcs-sync");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
