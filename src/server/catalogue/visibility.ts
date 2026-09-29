import type { CatalogueStatus, Prisma } from "@prisma/client";

/**
 * Who sees what in the catalogue. A product shows where both it and its
 * family are shown: draft is only in the staff catalogue, internal is for
 * staff and our own test organisations (so they can order it to try it),
 * live is on sale to everyone.
 */

/** "public": visitors and customers. "internal": our own test organisations. */
export type Audience = "public" | "internal";

const SHOWN: Record<Audience, CatalogueStatus[]> = { public: ["LIVE"], internal: ["INTERNAL", "LIVE"] };

const RANK: Record<CatalogueStatus, number> = { DRAFT: 0, INTERNAL: 1, LIVE: 2 };

export const audienceFor = (org: { internal?: boolean } | null | undefined): Audience => (org?.internal ? "internal" : "public");

/** A product's status once its family's is taken into account: the more hidden of the two. */
export const effectiveStatus = (product: { status: CatalogueStatus }, family: { status: CatalogueStatus }): CatalogueStatus =>
  RANK[product.status] <= RANK[family.status] ? product.status : family.status;

export type WithFamily = { status: CatalogueStatus; category: { family: { status: CatalogueStatus } } };

export const shownTo = (p: WithFamily, audience: Audience) => SHOWN[audience].includes(effectiveStatus(p, p.category.family));

/** Prisma filter for products an audience may see. */
export const shownWhere = (audience: Audience): Prisma.ProductWhereInput => ({
  status: { in: SHOWN[audience] },
  category: { family: { status: { in: SHOWN[audience] } } },
});

export const STATUS_LABEL: Record<CatalogueStatus, string> = { DRAFT: "Draft", INTERNAL: "Internal", LIVE: "Live" };
