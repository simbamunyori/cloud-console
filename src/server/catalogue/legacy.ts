import type { Prisma } from "@prisma/client";

/**
 * Legacy services: things migrated customers already have that we no
 * longer sell, or never sold under a catalogue product. They live in a
 * hidden "Legacy services" group so billing has a product to hang each
 * service on. They stay drafts for good: never offered, never in a price
 * book, and the WHMCS price sync sends them hidden, at a zero catalogue
 * price (every service carries its own price).
 */

export const LEGACY_FAMILY = "legacy";
export const LEGACY_CATEGORY = "legacy-services";

export const isLegacyCategory = (categoryKey: string) => categoryKey === LEGACY_CATEGORY;

type Tx = Pick<Prisma.TransactionClient, "productFamily" | "productCategory" | "product">;

export async function ensureLegacyCategory(tx: Tx) {
  await tx.productFamily.upsert({
    where: { key: LEGACY_FAMILY },
    update: {},
    create: { key: LEGACY_FAMILY, name: "Legacy services", description: "Services migrated customers keep that we don't sell any more. Never offered.", connector: "SERVICES", status: "DRAFT", sortOrder: 99 },
  });
  await tx.productCategory.upsert({
    where: { key: LEGACY_CATEGORY },
    update: {},
    create: { key: LEGACY_CATEGORY, name: "Legacy services", description: "Kept for customers who already have them.", familyKey: LEGACY_FAMILY, marginBps: 0, sortOrder: 99 },
  });
}

/** "legacy-" and the name in lower case with dashes, e.g. legacy-odoo-hosting-plan-a. */
export function legacySlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/^\[[^\]]*\]\s*/, "")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `legacy-${base || "service"}`;
}

/** The legacy product for an Odoo product name, made the first time. */
export async function legacyProduct(tx: Tx, odooName: string) {
  await ensureLegacyCategory(tx);
  const name = odooName.replace(/^\[[^\]]*\]\s*/, "").trim() || odooName.trim();
  const slug = legacySlug(odooName);
  return tx.product.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      categoryKey: LEGACY_CATEGORY,
      name,
      summary: `${name}, kept for customers who already have it.`,
      includes: [],
      excludes: [],
      unitLabel: "per service",
      quantityAllowed: false,
      costMinor: 0n,
      costCurrency: "USD",
      setupHours: 0,
      status: "DRAFT",
      fulfilment: "MANUAL",
      markets: [],
      sortOrder: 999,
    },
  });
}
