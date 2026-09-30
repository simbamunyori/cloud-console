import { addMonths, startOfMonth } from "@/lib/dates";
import type { InvoiceSummary, Service } from "@/server/billing/adapter";
import type { ScopedBilling } from "@/server/billing/scoped";
import type { TenantDb } from "@/server/db";
import { tenantOverview, unusedLicences } from "@/server/licences/licences";
import { forecast, invoicedThisMonth, monthlySpend, savings, savingsTotal, syncInvoiceSpend, type UsageRow } from "./spend";

/** Everything the Cloud spend page shows, read once per visit. */
export async function spendOverview(db: TenantDb, billing: ScopedBilling, organisationId: string, currency: string, today: Date, known?: { invoices?: InvoiceSummary[]; services?: Service[] }) {
  const services = known?.services ?? (await billing.listServices());
  await syncInvoiceSpend(db, billing, organisationId, today, { invoices: known?.invoices, services });
  const since = addMonths(startOfMonth(today), -11);
  const [kept, usageRows, subscriptions, tips, tenants] = await Promise.all([
    db.invoiceSpend.findMany({ where: { month: { gte: since } }, select: { month: true, status: true, currency: true, lines: true } }),
    db.cloudUsage.findMany({ where: { day: { gte: since } }, select: { day: true, subscriptionId: true, resourceGroup: true, category: true, priceMinor: true, currency: true } }),
    db.cloudSubscription.findMany({ orderBy: { name: "asc" } }),
    db.savingTip.findMany(),
    tenantOverview(db),
  ]);
  const usage: UsageRow[] = usageRows;
  const months = monthlySpend(kept, usage, currency, today);
  const list = savings(unusedLicences(tenants), services, tips);
  const lastUsageDay = usage.reduce<Date | null>((d, u) => (!d || u.day > d ? u.day : d), null);
  return {
    months,
    forecast: forecast(services, usage, currency, today, invoicedThisMonth(kept, currency, today)),
    savings: list,
    savingsTotal: savingsTotal(list, currency),
    subscriptions,
    usage,
    lastUsageDay,
  };
}

/** Azure usage for one month, by subscription and resource group, largest first. */
export function azureMonth(usage: UsageRow[], subscriptions: { id: string; name: string; budgetMinor: bigint | null }[], month: Date, currency: string) {
  const next = addMonths(month, 1);
  const inMonth = usage.filter((u) => u.day >= month && u.day < next && u.currency === currency);
  return subscriptions.map((s) => {
    const mine = inMonth.filter((u) => u.subscriptionId === s.id);
    const groups = new Map<string, bigint>();
    for (const u of mine) groups.set(u.resourceGroup, (groups.get(u.resourceGroup) ?? 0n) + u.priceMinor);
    return {
      id: s.id,
      name: s.name,
      budgetMinor: s.budgetMinor,
      lastDay: mine.reduce<Date | null>((d, u) => (!d || u.day > d ? u.day : d), null),
      total: mine.reduce((n, u) => n + u.priceMinor, 0n),
      groups: [...groups.entries()].map(([group, amountMinor]) => ({ group, amountMinor })).sort((a, b) => (b.amountMinor > a.amountMinor ? 1 : -1)),
    };
  });
}
