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
