import type { Fulfilment, PrismaClient, Product } from "@prisma/client";
import { money } from "@/lib/domain/money";
import { FULFILMENT_LABEL } from "@/server/admin/catalogue";
import { toAmount } from "@/server/billing/whmcs/map";
import { connectorFor } from "@/server/connectors/registry";
import type { ProductValues } from "../forms";

/** The choices a product form offers. */
export async function productFormOptions(db: PrismaClient) {
  const [categories, markets] = await Promise.all([
    db.productCategory.findMany({ orderBy: [{ family: { sortOrder: "asc" } }, { sortOrder: "asc" }], include: { family: true } }),
    db.market.findMany({ orderBy: { sortOrder: "asc" }, select: { code: true, name: true, currency: true } }),
  ]);
  const anyAutomatic = categories.some((c) => connectorFor(c.family.connector).automatic);
  const fulfilments = (Object.keys(FULFILMENT_LABEL) as Fulfilment[])
    .filter((f) => f !== "AUTOMATIC" || anyAutomatic)
    .map((f) => ({ value: f, label: FULFILMENT_LABEL[f] }));
  return {
    categories: categories.map((c) => ({ value: c.key, label: c.family.name === c.name ? c.name : `${c.family.name}: ${c.name}` })),
    markets: markets.map((m) => ({ value: m.code, label: m.name })),
    currencies: [...new Set([...markets.map((m) => m.currency), "USD"])].map((c) => ({ value: c, label: c })),
    fulfilments,
  };
}

export function productValues(p: Product): ProductValues {
  return {
    slug: p.slug,
    name: p.name,
    summary: p.summary,
    includes: p.includes.join("\n"),
    excludes: p.excludes.join("\n"),
    categoryKey: p.categoryKey,
    unitLabel: p.unitLabel,
    quantityAllowed: p.quantityAllowed,
    minQuantity: String(p.minQuantity),
    setupHours: String(p.setupHours),
    minTermMonths: String(p.minTermMonths),
    commitmentNote: p.commitmentNote ?? "",
    cost: toAmount(money(p.costMinor, p.costCurrency)),
    costCurrency: p.costCurrency,
    fixedPrice: p.fixedPriceMinor !== null && p.fixedPriceCurrency ? toAmount(money(p.fixedPriceMinor, p.fixedPriceCurrency)) : "",
    fixedPriceCurrency: p.fixedPriceCurrency ?? p.costCurrency,
    markets: p.markets,
    fulfilment: p.fulfilment,
    status: p.status,
    sortOrder: String(p.sortOrder),
  };
}
