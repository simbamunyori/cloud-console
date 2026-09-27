import { Prisma, type PrismaClient, type Product, type ProductCategory } from "@prisma/client";
import { money, type Money } from "@/lib/domain/money";
import { customerPrice, PricingError } from "@/lib/domain/pricing";
import { DomainError } from "@/server/org/access";
import { DOMAIN_PRODUCT_SLUG, type OptionSpec } from "./seed-data";

/**
 * The marketplace catalogue and this month's prices. A price is worked
 * out the first time it is needed in a month and then stored, so every
 * customer sees the same price all month even if staff change a margin
 * or the rate (the new figures apply from the next month).
 */

type CatalogueDb = Pick<PrismaClient, "monthlyPrice" | "pricingSettings" | "fxRate" | "productCategory" | "product">;

export type ProductWithCategory = Product & { category: ProductCategory };

export interface PricedProduct {
  product: ProductWithCategory;
  /** Price per unit per month, or null when it can't be priced this month (no rate yet). */
  price: Money | null;
  options: OptionSpec[];
}

async function rateFor(db: CatalogueDb, month: string, base: string, quote: string) {
  const rate = await db.fxRate.findFirst({ where: { base, quote, month: { lte: month } }, orderBy: { month: "desc" } });
  return rate?.rateMicros ?? null;
}

/** This month's price for one unit, stored on first use. */
export async function monthlyPrice(db: CatalogueDb, product: ProductWithCategory, currency: string, month: string): Promise<Money> {
  const stored = await db.monthlyPrice.findUnique({ where: { productId_month_currency: { productId: product.id, month, currency } } });
  if (stored) return money(stored.amountMinor, currency);

  const settings = await db.pricingSettings.findUnique({ where: { id: "global" } });
  const rateMicros = product.costCurrency === currency ? null : await rateFor(db, month, product.costCurrency, currency);
  let result;
  try {
    result = customerPrice(
      {
        cost: money(product.costMinor, product.costCurrency),
        fixedPrice: product.fixedPriceMinor !== null && product.fixedPriceCurrency ? money(product.fixedPriceMinor, product.fixedPriceCurrency) : null,
        marginBps: product.category.marginBps,
        bufferBps: settings?.currencyBufferBps ?? 0,
        rateMicros,
      },
      currency,
    );
  } catch (e) {
    if (e instanceof PricingError) throw new DomainError("unavailable", `${product.name} can't be ordered in ${currency} yet. Please contact us.`);
    throw e;
  }
  try {
    await db.monthlyPrice.create({ data: { productId: product.id, month, currency, amountMinor: result.price.amountMinor, breakdown: result.breakdown as unknown as Prisma.InputJsonValue } });
    return result.price;
  } catch (e) {
    // Someone else stored it first; theirs stands.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const row = await db.monthlyPrice.findUniqueOrThrow({ where: { productId_month_currency: { productId: product.id, month, currency } } });
      return money(row.amountMinor, currency);
    }
    throw e;
  }
}

export const productOptions = (p: Product): OptionSpec[] => (Array.isArray(p.options) ? (p.options as unknown as OptionSpec[]) : []);

/** Everything on sale, by category, with this month's prices. */
export async function marketplace(db: CatalogueDb, currency: string, month: string) {
  const categories = await db.productCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { products: { where: { active: true, slug: { not: DOMAIN_PRODUCT_SLUG } }, orderBy: { sortOrder: "asc" } } },
  });
  const out: { category: ProductCategory; products: PricedProduct[] }[] = [];
  for (const { products, ...category } of categories) {
    if (!products.length) continue;
    const priced: PricedProduct[] = [];
    for (const product of products) {
      const withCategory = { ...product, category };
      const price = await monthlyPrice(db, withCategory, currency, month).catch((e) => {
        if (e instanceof DomainError) return null;
        throw e;
      });
      priced.push({ product: withCategory, price, options: productOptions(product) });
    }
    out.push({ category, products: priced });
  }
  return out;
}

export async function productBySlug(db: CatalogueDb, slug: string): Promise<ProductWithCategory | null> {
  const product = await db.product.findUnique({ where: { slug }, include: { category: true } });
  return product?.active ? product : null;
}

const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Checks the customer's choices against the product's options. Returns the cleaned values, keyed by option key. */
export function validateOptions(specs: OptionSpec[], input: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const spec of specs) {
    const raw = (input[spec.key] ?? "").trim();
    const field = `option_${spec.key}`;
    if (!raw) {
      if (spec.required) errors[field] = spec.type === "select" ? `Choose ${spec.label.toLowerCase()}.` : `Enter ${spec.label.toLowerCase()}.`;
      continue;
    }
    if (spec.type === "select" && !spec.choices?.includes(raw)) errors[field] = `Choose one of the options for ${spec.label.toLowerCase()}.`;
    else if (spec.format === "domain" && !DOMAIN.test(raw.toLowerCase())) errors[field] = "Enter a domain like yourcompany.co.bw, without www or https.";
    else if (raw.length > 120) errors[field] = "That's too long.";
    else values[spec.key] = spec.format === "domain" ? raw.toLowerCase() : raw;
  }
  if (Object.keys(errors).length) throw new DomainError("invalid", Object.values(errors)[0], undefined, errors);
  return values;
}
