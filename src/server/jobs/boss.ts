import "server-only";
import PgBoss from "pg-boss";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { emailAdapter } from "@/server/email/adapter";
import { deliverDue } from "@/server/email/outbox";
import { billingAdapter } from "@/server/billing";
import { applyDefaultPoNumbers } from "@/server/billing/po";
import { StubBillingAdapter } from "@/server/billing/stub/stub-adapter";
import { reconcileLicences } from "@/server/licences/reconcile";
import { purgeSales } from "@/server/sales/leads";
import { checkBudgets } from "@/server/spend/budgets";
import { checkBilling } from "@/server/status/status";
import { assistantModel } from "@/server/support/assistant/model";
import { todayIn } from "@/lib/dates";
import { DEFAULT_TIME_ZONE } from "@/config/app";

/**
 * Background jobs, on pg-boss in the same PostgreSQL database. Each job
 * is safe to run twice: it claims its rows before acting.
 */

type Job = { name: string; cron?: string; run: () => Promise<unknown> };

const JOBS: Job[] = [
  { name: "email-deliver", cron: "* * * * *", run: () => deliverDue(prisma, emailAdapter()) },
  {
    // WHMCS raises its own invoices from its daily cron; the stub needs this.
    name: "stub-billing-run",
    cron: "15 2 * * *",
    run: async () => {
      const adapter = billingAdapter();
      if (adapter instanceof StubBillingAdapter) await adapter.runBillingCycle();
    },
  },
  { name: "default-po-numbers", cron: "0 3 * * *", run: () => applyDefaultPoNumbers(prisma, billingAdapter()) },
  // Licences bought, billed and held should agree; each gap becomes a staff task.
  { name: "licence-reconcile", cron: "30 3 * * *", run: () => reconcileLicences(prisma, billingAdapter()) },
  // Budget warnings, once usage for yesterday is usually in; uploads also check at once.
  { name: "budget-check", cron: "0 7 * * *", run: () => checkBudgets(prisma, todayIn(DEFAULT_TIME_ZONE)) },
  // The site's status: ordering and invoices depend on the billing system answering.
  { name: "status-check-billing", cron: "*/5 * * * *", run: () => checkBilling(prisma, () => billingAdapter().getTldPricing("BWP")) },
  // Thapelo's chats and leads past their keep-until date (Privacy Notice).
  { name: "sales-purge", cron: "45 3 * * *", run: () => purgeSales(prisma) },
  // Follow-up emails to leads (Milestone 8); each stops when they buy or unsubscribe.
  {
    name: "lead-follow-ups",
    cron: "*/15 * * * *",
    run: async () => {
      const { sendFollowUps } = await import("@/server/leads/capture");
      if (await sendFollowUps(prisma)) await deliverDue(prisma, emailAdapter());
    },
  },
  // A reminder to the visitor a day before a pre-sales call.
  {
    name: "booking-reminders",
    cron: "5 * * * *",
    run: async () => {
      const { sendReminders } = await import("@/server/presales/booking");
      return sendReminders(prisma);
    },
  },
  // The Odoo import, once an admin approves its dry run (Milestone 9b); approving also asks for it at once.
  {
    name: "odoo-import",
    cron: "*/5 * * * *",
    run: async () => {
      const [{ runApprovedImports }, { linkProductsToBilling }] = await Promise.all([import("@/server/migration/run"), import("@/server/billing")]);
      return runApprovedImports({ db: prisma, adapter: billingAdapter(), linkProducts: linkProductsToBilling });
    },
  },
  // Welcome emails for migrated customers, from 08:00 on the cutover date an admin chose.
  {
    name: "migration-welcome",
    cron: "*/15 * * * *",
    run: async () => {
      const { sendWelcomes } = await import("@/server/migration/welcome");
      if (await sendWelcomes({ db: prisma })) await deliverDue(prisma, emailAdapter());
    },
  },
  // Services hosted elsewhere: a suspension, unsuspension or cancellation in billing becomes a staff task; late ones get reminders.
  {
    name: "hosted-elsewhere",
    cron: "*/15 * * * *",
    run: async () => {
      const { remindLateTasks, watchHostedElsewhere } = await import("@/server/migration/services");
      await watchHostedElsewhere({ db: prisma, adapter: billingAdapter() });
      return remindLateTasks({ db: prisma });
    },
  },
  // First drafts for launch kits; saving a product as live also asks for it at once.
  {
    name: "launch-kit-drafts",
    cron: "*/5 * * * *",
    run: async () => {
      const [{ writeDrafts }, { cms }] = await Promise.all([import("@/server/launch/kits"), import("@/server/site/cms")]);
      return writeDrafts({ db: prisma, payload: await cms(), model: assistantModel() });
    },
  },
  // Last month's newsletter, prepared on the 1st for a Publisher to check and send.
  {
    name: "newsletter-prepare",
    cron: "0 6 1 * *",
    run: async () => {
      const [{ prepareIssues }, { cms }] = await Promise.all([import("@/server/newsletter/issues"), import("@/server/site/cms")]);
      return prepareIssues({ db: prisma, payload: await cms() });
    },
  },
  // Bank of Botswana's reference rates: kept daily, with alerts when they fail, jump or drift past the buffer.
  {
    name: "exchange-rates",
    cron: "30 5,9,13,17 * * *",
    run: async () => {
      const { ratesJob } = await import("@/server/pricing/jobs");
      await ratesJob();
      return deliverDue(prisma, emailAdapter());
    },
  },
  // Every other Monday, the next 14 days' price book from those rates, approved automatically within the threshold. Quotes are valid for 14 days too.
  {
    name: "price-book-period",
    cron: "0 6 * * 1",
    run: async () => {
      const { periodJob } = await import("@/server/pricing/jobs");
      await periodJob();
      return deliverDue(prisma, emailAdapter());
    },
  },
  // Paid domain registrations, transfers and renewals go to the registrar on their own (docs/STRATEGY_ROLLOUT.md, U1).
  {
    name: "domain-operations",
    cron: "*/5 * * * *",
    run: async () => {
      const { runDomainOperations } = await import("@/server/domains/operations");
      if (await runDomainOperations({ db: prisma, adapter: billingAdapter() })) await deliverDue(prisma, emailAdapter());
    },
  },
  // Our domain costs from Openprovider, ahead of each morning's price work.
  {
    name: "domain-costs",
    cron: "0 5 * * *",
    run: async () => {
      const { syncDomainCosts } = await import("@/server/domains/costs");
      return syncDomainCosts({ db: prisma });
    },
  },
  // Off-site backup status from the provider's API (STRATEGY_ROLLOUT U3); nothing in manual mode or while the partner is off.
  {
    name: "backup-sync",
    cron: "10 * * * *",
    run: async () => {
      const { syncBackups } = await import("@/server/backup/backup");
      return syncBackups({ db: prisma });
    },
  },
  // The full security score every night, and the monthly report on the 1st (STRATEGY_ROLLOUT U4); nothing while the feature is off.
  {
    name: "security-scores",
    cron: "15 4 * * *",
    run: async () => {
      const [{ refreshAllScores }, { emailCheckLookup }] = await Promise.all([import("@/server/security/score-facts"), import("@/server/tools/lookup")]);
      return refreshAllScores({ db: prisma, adapter: billingAdapter(), lookup: emailCheckLookup() });
    },
  },
  {
    name: "security-reports",
    cron: "0 7 1 * *",
    run: async () => {
      const { writeMonthlyReports } = await import("@/server/security/reports");
      return writeMonthlyReports(prisma);
    },
  },
  // Each new invoice by email with its PDF, once Admin > Features > Invoice emails is on.
  {
    name: "invoice-emails",
    cron: "*/30 * * * *",
    run: async () => {
      const { emailNewInvoices } = await import("@/server/billing/invoice-emails");
      if (await emailNewInvoices({ db: prisma, adapter: billingAdapter() })) await deliverDue(prisma, emailAdapter());
    },
  },
];

/** Later milestones add their jobs here (billing sync, purges). */
export function registerJob(job: Job) {
  if (!JOBS.some((j) => j.name === job.name)) JOBS.push(job);
}

const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss | null> };

async function start(): Promise<PgBoss | null> {
  if (env().CONSOLE_JOBS === "off") return null;
  const boss = new PgBoss({ connectionString: env().DATABASE_URL, schema: "pgboss" });
  boss.on("error", (e) => console.error("Background jobs:", e));
  await boss.start();
  for (const job of JOBS) {
    await boss.createQueue(job.name);
    await boss.work(job.name, async () => {
      await job.run();
    });
    if (job.cron) await boss.schedule(job.name, job.cron, {}, { tz: "Africa/Gaborone" });
  }
  return boss;
}

export function startJobs(): Promise<PgBoss | null> {
  globalForBoss.boss ??= start().catch((e) => {
    console.error("Background jobs did not start:", e);
    return null;
  });
  return globalForBoss.boss;
}

/** Runs a job now instead of waiting for its schedule, e.g. to send an email straight away. */
export async function runSoon(name: string) {
  const boss = await startJobs();
  if (boss) await boss.send(name, {});
}
