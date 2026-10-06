import "server-only";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { todayIn } from "@/lib/dates";
import { priceDay, periodOf } from "@/lib/domain/pricing";
import { priceSyncer } from "@/server/billing";
import { prisma } from "@/server/db";
import { secret } from "@/server/secrets";
import { allRatesToday, checkRates, type RateSource } from "./official-rates";
import { buildPeriod, retrySync } from "./periods";

/** Where the Bank of Botswana tables come from: AllRatesToday once its key is set, else nowhere (rates are typed by hand). */
export function rateSource(): RateSource | null {
  const key = secret("ALLRATESTODAY_API_KEY");
  return key ? allRatesToday(key) : null;
}

/** Whether rates come from Bank of Botswana automatically. */
export const ratesAutomatic = () => rateSource() !== null;

/**
 * Mondays at 06:00 (boss.ts): every other Monday starts a 14-day period,
 * and that day builds its price book. The Mondays between only retry a
 * WHMCS sync.
 */
export async function periodJob() {
  if (!rateSource()) return;
  const deps = { db: prisma, sync: priceSyncer() };
  const today = priceDay(todayIn(DEFAULT_TIME_ZONE));
  if (periodOf(today) === today) await buildPeriod(deps);
  await retrySync(deps);
}

/**
 * The rates job (boss.ts): fetch and check the day's table, then make up
 * for what didn't happen on time. A period's price book is built here
 * only when its first day tried and had to wait for rates, so turning
 * automation on mid-period never changes prices mid-period.
 */
export async function ratesJob() {
  const source = rateSource();
  if (!source) return;
  await checkRates({ db: prisma, source });
  const deps = { db: prisma, sync: priceSyncer() };
  const period = periodOf(priceDay(todayIn(DEFAULT_TIME_ZONE)));
  const waited = await prisma.pricingAlert.count({ where: { key: { startsWith: `build-waiting:${period}:` } } });
  if (waited && !(await prisma.priceBookRun.findUnique({ where: { period } }))) await buildPeriod(deps);
  await retrySync(deps);
}
