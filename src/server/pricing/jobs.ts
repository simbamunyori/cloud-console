import "server-only";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { todayIn } from "@/lib/dates";
import { monthOf } from "@/lib/domain/pricing";
import { priceSyncer } from "@/server/billing";
import { prisma } from "@/server/db";
import { secret } from "@/server/secrets";
import { buildMonth, retrySync } from "./monthly";
import { allRatesToday, checkRates, type RateSource } from "./official-rates";

/** Where the Bank of Botswana tables come from: AllRatesToday once its key is set, else nowhere (rates are typed by hand). */
export function rateSource(): RateSource | null {
  const key = secret("ALLRATESTODAY_API_KEY");
  return key ? allRatesToday(key) : null;
}

/** Whether rates come from Bank of Botswana automatically. */
export const ratesAutomatic = () => rateSource() !== null;

/** The 1st of the month at 06:00 (boss.ts): this month's price book. */
export async function monthJob() {
  if (!rateSource()) return;
  const deps = { db: prisma, sync: priceSyncer() };
  await buildMonth(deps);
  await retrySync(deps);
}

/**
 * The rates job (boss.ts): fetch and check the day's table, then make up
 * for what didn't happen on time. The month's price book is built here
 * only when the 1st tried and had to wait for rates, so turning
 * automation on mid-month never changes prices mid-month.
 */
export async function ratesJob() {
  const source = rateSource();
  if (!source) return;
  await checkRates({ db: prisma, source });
  const deps = { db: prisma, sync: priceSyncer() };
  const month = monthOf(todayIn(DEFAULT_TIME_ZONE));
  const waited = await prisma.pricingAlert.count({ where: { key: { startsWith: `build-waiting:${month}:` } } });
  if (waited && !(await prisma.priceBookRun.findUnique({ where: { month } }))) await buildMonth(deps);
  await retrySync(deps);
}
