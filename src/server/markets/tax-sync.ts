import type { Market, PrismaClient } from "@prisma/client";
import { CATCH_ALL } from "./markets";

/**
 * Tax is charged by the billing engine, which keeps tax rules by client
 * country. For the stub, the console writes those rules from market
 * settings after every change. On WHMCS they are set up to match by hand
 * (Setup > Payments > Tax Configuration); see docs/whmcs-mapping.md.
 */
export function taxRulesFor(markets: Pick<Market, "code" | "countries" | "taxEnabled" | "taxRateBps" | "taxLabel">[]) {
  const rules: { country: string; rateBps: number; label: string }[] = [];
  for (const m of markets) {
    const rateBps = m.taxEnabled ? m.taxRateBps : 0;
    if (m.code === CATCH_ALL) rules.push({ country: "*", rateBps, label: m.taxLabel });
    for (const country of m.countries) rules.push({ country, rateBps, label: m.taxLabel });
  }
  return rules;
}

export async function syncStubTaxRules(db: Pick<PrismaClient, "market" | "stubTaxRule" | "$transaction">) {
  const rules = taxRulesFor(await db.market.findMany());
  await db.$transaction([db.stubTaxRule.deleteMany({}), db.stubTaxRule.createMany({ data: rules })]);
}
