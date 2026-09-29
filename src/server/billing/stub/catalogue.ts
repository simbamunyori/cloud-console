import type { PrismaClient } from "@prisma/client";

/**
 * What the stub's catalogue holds, standing in for the WHMCS product list.
 * Prices here are placeholders: the console works out every customer
 * price itself (cost, margin, buffer) and sends it with the order, as it
 * will to WHMCS. Keys are how the console's own catalogue finds them.
 */
export const STUB_PRODUCTS = [
  { key: "m365-basic", gid: 1, groupName: "Productivity", name: "Microsoft 365 Business Basic", type: "other", monthly: 9500n },
  { key: "m365-standard", gid: 1, groupName: "Productivity", name: "Microsoft 365 Business Standard", type: "other", monthly: 19000n },
  { key: "m365-premium", gid: 1, groupName: "Productivity", name: "Microsoft 365 Business Premium", type: "other", monthly: 35000n },
  { key: "gws-starter", gid: 1, groupName: "Productivity", name: "Google Workspace Business Starter", type: "other", monthly: 11000n },
  { key: "gws-standard", gid: 1, groupName: "Productivity", name: "Google Workspace Business Standard", type: "other", monthly: 22000n },
  { key: "gws-plus", gid: 1, groupName: "Productivity", name: "Google Workspace Business Plus", type: "other", monthly: 36000n },
  { key: "azure-managed", gid: 2, groupName: "Public cloud", name: "Azure subscription, managed", type: "other", monthly: 150000n },
  { key: "vps-small", gid: 3, groupName: "Servers", name: "Managed VPS, small", type: "server", monthly: 45000n },
  { key: "vps-medium", gid: 3, groupName: "Servers", name: "Managed VPS, medium", type: "server", monthly: 85000n },
  { key: "vps-large", gid: 3, groupName: "Servers", name: "Managed VPS, large", type: "server", monthly: 165000n },
  { key: "web-hosting", gid: 4, groupName: "Web", name: "Web hosting", type: "hostingaccount", monthly: 12000n },
  { key: "wordpress-hosting", gid: 4, groupName: "Web", name: "WordPress hosting", type: "hostingaccount", monthly: 22000n },
  { key: "business-email", gid: 4, groupName: "Web", name: "Business email", type: "hostingaccount", monthly: 4500n },
  { key: "ssl", gid: 4, groupName: "Web", name: "SSL certificate", type: "other", monthly: 6000n },
  { key: "backup-m365", gid: 5, groupName: "Protection", name: "Backup for Microsoft 365", type: "other", monthly: 3500n },
  { key: "backup-gws", gid: 5, groupName: "Protection", name: "Backup for Google Workspace", type: "other", monthly: 3500n },
  { key: "backup-server", gid: 5, groupName: "Protection", name: "Server backup", type: "other", monthly: 25000n },
  { key: "disaster-recovery", gid: 5, groupName: "Protection", name: "Disaster recovery", type: "other", monthly: 120000n },
  { key: "local-data-copy", gid: 5, groupName: "Protection", name: "Local data copy", type: "other", monthly: 30000n },
  { key: "mdr", gid: 5, groupName: "Protection", name: "Managed detection and response", type: "other", monthly: 12000n },
  { key: "thebe", gid: 6, groupName: "Our software", name: "Thebe", type: "other", monthly: 65000n },
  { key: "migration-pack", gid: 7, groupName: "Services", name: "Setup and migration pack", type: "other", monthly: 0n, setup: 250000n },
  { key: "managed-support", gid: 7, groupName: "Services", name: "Managed support plan", type: "other", monthly: 150000n },
  { key: "domain-registration", gid: 4, groupName: "Web", name: "Domain registration", type: "other", monthly: 0n },
] as const;

export type StubProductKey = (typeof STUB_PRODUCTS)[number]["key"];

/**
 * Domain endings the stub billing engine can register. The console charges
 * the price in the customer's market's price book; these BWP prices stand
 * in for WHMCS's own TLD pricing. `taken` are names the stub treats as
 * registered elsewhere.
 */
export const STUB_TLDS = [
  { tld: ".bw", register: 35000n, renew: 35000n, transfer: 35000n, taken: ["bocra", "debswana", "gov", "mascom", "btc", "orange"] },
  { tld: ".co.bw", register: 18000n, renew: 18000n, transfer: 18000n, taken: ["debswana", "mascom", "orange", "fnb", "choppies", "example"] },
  { tld: ".com", register: 22000n, renew: 24000n, transfer: 22000n, taken: ["google", "example", "microsoft", "debswana", "fourthgen"] },
  { tld: ".africa", register: 30000n, renew: 30000n, transfer: 30000n, taken: ["safari", "example"] },
  { tld: ".co.za", register: 12000n, renew: 12000n, transfer: 12000n, taken: ["takealot", "example"] },
  { tld: ".co.zw", register: 20000n, renew: 20000n, transfer: 20000n, taken: ["econet", "example"] },
  { tld: ".net", register: 22000n, renew: 24000n, transfer: 22000n, taken: ["example"] },
  { tld: ".org", register: 22000n, renew: 24000n, transfer: 22000n, taken: ["example", "wikipedia"] },
  { tld: ".io", register: 60000n, renew: 60000n, transfer: 60000n, taken: ["example", "github"] },
];

/** Loads the catalogue and domain prices into the stub. Safe to run again. Returns product ids by key. */
export async function seedStubCatalogue(db: PrismaClient): Promise<Record<StubProductKey, string>> {
  const ids = {} as Record<StubProductKey, string>;
  for (const p of STUB_PRODUCTS) {
    const pricing = { BWP: { monthly: p.monthly.toString(), ...("setup" in p ? { setup: p.setup.toString() } : {}) } };
    const existing = await db.stubProduct.findFirst({ where: { name: p.name } });
    const row = existing
      ? await db.stubProduct.update({ where: { id: existing.id }, data: { gid: p.gid, groupName: p.groupName, type: p.type, pricing } })
      : await db.stubProduct.create({ data: { gid: p.gid, groupName: p.groupName, name: p.name, type: p.type, pricing } });
    ids[p.key] = String(row.id);
  }
  for (const t of STUB_TLDS) {
    const data = { currency: "BWP", register: t.register, renew: t.renew, transfer: t.transfer, takenNames: t.taken };
    await db.stubTldPrice.upsert({ where: { tld: t.tld }, update: data, create: { tld: t.tld, ...data } });
  }
  return ids;
}

/**
 * Gives a product added in the staff Catalogue a product in the stub, as
 * the WHMCS product sync does for WHMCS, once it is internal or live.
 * Its price here is a placeholder: orders carry the console's own price.
 */
export async function linkStubProduct(db: PrismaClient, slug: string): Promise<string | null> {
  const product = await db.product.findUnique({ where: { slug }, include: { category: true } });
  if (!product || product.billingProductId || product.status === "DRAFT") return product?.billingProductId ?? null;
  const row = await db.stubProduct.create({ data: { gid: 100, groupName: product.category.name, name: product.name, type: "other", pricing: { BWP: { monthly: "0" } } } });
  await db.product.update({ where: { slug }, data: { billingProductId: String(row.id) } });
  return String(row.id);
}
