import { prisma } from "@/server/db";

export interface CatalogueSelection {
  categories?: string[];
  products?: string[];
}

export interface CatalogueOptions {
  categories: { key: string; name: string; products: { slug: string; name: string; active: boolean }[] }[];
}

/** The catalogue as the website editor's picker shows it: every category and its products, hidden ones marked. */
export async function catalogueOptions(): Promise<CatalogueOptions> {
  const categories = await prisma.productCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { products: { orderBy: { sortOrder: "asc" }, select: { slug: true, name: true, active: true } } },
  });
  return { categories: categories.map((c) => ({ key: c.key, name: c.name, products: c.products })) };
}

/** A stored selection, whatever shape the editor saved. */
export function selection(value: unknown): Required<CatalogueSelection> {
  const v = (value && typeof value === "object" ? value : {}) as CatalogueSelection;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return { categories: strings(v.categories), products: strings(v.products) };
}
