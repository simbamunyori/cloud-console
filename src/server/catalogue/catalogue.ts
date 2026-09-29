import type { PrismaClient, Product, ProductCategory, ProductFamily } from "@prisma/client";
import { DomainError } from "@/server/org/access";
import type { OptionSpec } from "./seed-data";
import { shownTo, type Audience } from "./visibility";

/**
 * The marketplace catalogue: products and their options. Prices come from
 * each market's price book; see price-book.ts.
 */

type CatalogueDb = Pick<PrismaClient, "product">;

export type ProductWithCategory = Product & { category: ProductCategory & { family: ProductFamily } };

export const productOptions = (p: Product): OptionSpec[] => (Array.isArray(p.options) ? (p.options as unknown as OptionSpec[]) : []);

const WITH_FAMILY = { category: { include: { family: true } } } as const;

/** A product the audience may see (see visibility.ts), or null. */
export async function productBySlug(db: CatalogueDb, slug: string, audience: Audience = "public"): Promise<ProductWithCategory | null> {
  const product = await db.product.findUnique({ where: { slug }, include: WITH_FAMILY });
  return product && shownTo(product, audience) ? product : null;
}

/** Any product, whatever its status: for staff previews. */
export async function anyProductBySlug(db: CatalogueDb, slug: string): Promise<ProductWithCategory | null> {
  return db.product.findUnique({ where: { slug }, include: WITH_FAMILY });
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
