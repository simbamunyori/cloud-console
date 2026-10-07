import type { PrismaClient } from "@prisma/client";
import { cache } from "react";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";

/**
 * Admin > Features (docs/STRATEGY_ROLLOUT.md, rule 4). Every new feature
 * ships switched off and stays invisible to customers until an Admin turns
 * it on here. No row in FeatureSwitch means off.
 */

export interface FeatureDefinition {
  label: string;
  /** What turning it on does, in plain words for the Admin. */
  description: string;
  /** Which milestone added it. */
  milestone: string;
  /** Something that must be true first, checked before it can be turned on. */
  requires?: (db: PrismaClient) => Promise<string | null>;
}

export const FEATURES = {
  "openprovider-domains": {
    label: "Domains through Openprovider",
    description:
      "Domain search checks Openprovider live, paid registrations and transfers go to Openprovider on their own, and customers manage nameservers, DNS records, contacts, renewals and transfer codes in the console. Endings other than .bw only.",
    milestone: "U1",
    requires: async (db) => {
      const p = await db.partnerSetting.findUnique({ where: { key: "openprovider" } });
      if (!p?.enabled) return "Set up Openprovider in Partners and switch it on first.";
      return null;
    },
  },
  "bw-registry-domains": {
    label: ".bw domains through the registry",
    description: ".bw and .co.bw registrations, renewals and transfers go to the .bw registry on their own, instead of a staff task. Turn on once BOCRA confirms its requirements.",
    milestone: "U1",
    requires: async (db) => {
      const p = await db.partnerSetting.findUnique({ where: { key: "bw-registry" } });
      if (!p?.enabled) return "Set up the .bw registry in Partners and switch it on first.";
      return null;
    },
  },
  "branded-pdfs": {
    label: "Invoice and quote PDFs",
    description: "Customers download branded PDF invoices and quotes, staff download them too, and sent quotes carry the PDF.",
    milestone: "U1",
  },
  "invoice-emails": {
    label: "Invoice emails",
    description:
      "Each new invoice is emailed to the customer's billing contact with the branded PDF attached, the bank details and a link to pay online. Only invoices raised after this is turned on are emailed.",
    milestone: "U1",
  },
  "botswana-data-claim": {
    label: "Say data is kept in Botswana",
    description: "Shows the wording that customer data is kept in Botswana. Leave off until our own platform has moved to the Botswana data centre.",
    milestone: "U1",
  },
  "included-protection": {
    label: "Security and backup included in plans",
    description:
      "Shows customers the email security and backup each Microsoft 365, Google Workspace and hosting plan includes (set in the catalogue), sets them up with each new order, and counts their cost in the price book's suggestions. Check the plan margin report at /admin/pricing first.",
    milestone: "U3",
  },
  "customer-backup": {
    label: "Off-site backup in the console",
    description:
      "Customers see a Backup page: each backup's status, last successful backup, how long copies are kept, and restore requests. Delivered through the backup provider set up in Partners, under our name only.",
    milestone: "U3",
    requires: async (db) => {
      const p = await db.partnerSetting.findUnique({ where: { key: "backup-provider" } });
      if (!p?.enabled) return "Set up the backup provider in Partners and switch it on first.";
      return null;
    },
  },
  "security-score": {
    label: "Full security score and monthly report",
    description:
      "Each customer's security score comes from real checks (their email domain, two-step login, backup of each service, and device and workspace checks once those are connected), each with a plain fix and the product that fixes it. Customers get a monthly report in the console and by email as a PDF; staff see every score, lowest first.",
    milestone: "U4",
  },
} satisfies Record<string, FeatureDefinition>;

export type FeatureKey = keyof typeof FEATURES;

export const isFeatureKey = (key: string): key is FeatureKey => key in FEATURES;

type FeatureDb = Pick<PrismaClient, "featureSwitch">;

export async function featureOn(db: FeatureDb, key: FeatureKey): Promise<boolean> {
  const row = await db.featureSwitch.findUnique({ where: { key } });
  return row?.enabled ?? false;
}

/** All switches, read once per request. */
export const featureSwitches = cache(async (db: FeatureDb): Promise<Record<FeatureKey, boolean>> => {
  const rows = await db.featureSwitch.findMany();
  const on = new Map(rows.map((r) => [r.key, r.enabled]));
  return Object.fromEntries(Object.keys(FEATURES).map((k) => [k, on.get(k) ?? false])) as Record<FeatureKey, boolean>;
});

export async function featureList(db: PrismaClient) {
  const rows = await db.featureSwitch.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return (Object.entries(FEATURES) as [FeatureKey, FeatureDefinition][]).map(([key, f]) => {
    const row = byKey.get(key);
    return { key, ...f, enabled: row?.enabled ?? false, updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
  });
}

/** Admins only. Every change is in the staff audit log. */
export async function setFeature(deps: { db: PrismaClient; staff: StaffActor; now?: Date }, key: string, enabled: boolean) {
  assertStaffCan(deps.staff, "manageFeatures");
  if (!isFeatureKey(key)) throw new DomainError("not-found", "No such feature.");
  const feature: FeatureDefinition = FEATURES[key];
  if (enabled && feature.requires) {
    const problem = await feature.requires(deps.db);
    if (problem) throw new DomainError("conflict", problem);
  }
  await deps.db.$transaction(async (tx) => {
    const before = await tx.featureSwitch.findUnique({ where: { key } });
    if ((before?.enabled ?? false) === enabled) return;
    await tx.featureSwitch.upsert({
      where: { key },
      create: { key, enabled, updatedById: deps.staff.userId, updatedBy: deps.staff.name },
      update: { enabled, updatedById: deps.staff.userId, updatedBy: deps.staff.name },
    });
    await tx.staffAuditEvent.create({
      data: {
        actorUserId: deps.staff.userId,
        actorLabel: deps.staff.name,
        action: enabled ? "feature.on" : "feature.off",
        summary: `${enabled ? "Turned on" : "Turned off"} ${feature.label}`,
        data: { key },
      },
    });
  });
}
