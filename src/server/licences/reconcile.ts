import type { PrismaClient } from "@prisma/client";
import type { BillingAdapter, Service } from "@/server/billing/adapter";
import { VENDOR_LABEL } from "./provider";

/**
 * The nightly licence check. For every tenant it compares three numbers
 * for each licence: what billing charges for (the matching service's
 * seats), what the tenant holds (bought), and how many people hold one.
 * A gap becomes a task for staff, once: an open task for the same gap is
 * not repeated. When the vendor APIs are connected, "bought" is read from
 * the vendor first.
 */

export const RECONCILE_KIND = "licence_reconcile";

export interface LicenceGap {
  organisationId: string;
  organisationName: string;
  tenant: string;
  licence: string;
  billed: number;
  purchased: number;
  inUse: number;
  problem: "billing-differs" | "over-assigned";
}

const BILLED: Service["status"][] = ["active", "suspended"];

export function gapTitle(g: LicenceGap): string {
  return g.problem === "over-assigned"
    ? `${g.inUse} people hold ${g.licence} but ${g.purchased} are bought (${g.organisationName})`
    : `${g.licence}: billed for ${g.billed}, tenant has ${g.purchased} (${g.organisationName})`;
}

function gapSteps(g: LicenceGap): string[] {
  return g.problem === "over-assigned"
    ? [
        `Check ${g.licence} in ${g.tenant}: the console shows ${g.inUse} people holding one but only ${g.purchased} bought.`,
        "If the portal agrees, buy the missing licences and raise the seats on the customer's service, or ask the customer which licences to take back.",
        "Correct the count at the customer's Users and licences page, then mark this done.",
      ]
    : [
        `Check ${g.licence} in ${g.tenant}: billing charges for ${g.billed}, the console records ${g.purchased} bought.`,
        g.billed > g.purchased ? "If the portal has fewer, buy the rest: the customer is already paying for them." : "If the portal has more, reduce them or raise the customer's seats, so we don't pay for licences we don't bill.",
        "Record the right count at the customer's Users and licences page, then mark this done.",
      ];
}

/** Finds the gaps and opens a task for each new one. Returns every gap found. */
export async function reconcileLicences(db: PrismaClient, adapter: BillingAdapter, now = new Date()): Promise<LicenceGap[]> {
  const tenants = await db.tenant.findMany({
    where: { organisation: { deletedAt: null } },
    include: {
      organisation: { select: { id: true, name: true, billingAccount: { select: { externalClientId: true, provider: true } } } },
      licences: { include: { _count: { select: { assignments: true } } } },
    },
  });
  const servicesByClient = new Map<string, Service[]>();
  const gaps: LicenceGap[] = [];

  for (const t of tenants) {
    const account = t.organisation.billingAccount;
    let services: Service[] = [];
    if (account && account.provider === adapter.provider) {
      if (!servicesByClient.has(account.externalClientId)) servicesByClient.set(account.externalClientId, await adapter.listServices(account.externalClientId));
      services = servicesByClient.get(account.externalClientId)!;
    }
    for (const l of t.licences) {
      const billed = services.filter((s) => BILLED.includes(s.status) && s.name === l.name).reduce((n, s) => n + s.quantity, 0);
      const base = { organisationId: t.organisation.id, organisationName: t.organisation.name, tenant: `${VENDOR_LABEL[t.vendor]} ${t.primaryDomain}`, licence: l.name, billed, purchased: l.purchased, inUse: l._count.assignments };
      if (l._count.assignments > l.purchased) gaps.push({ ...base, problem: "over-assigned" });
      if (billed !== l.purchased) gaps.push({ ...base, problem: "billing-differs" });
    }
  }

  for (const g of gaps) {
    const title = gapTitle(g);
    const open = await db.provisioningTask.findFirst({ where: { organisationId: g.organisationId, kind: RECONCILE_KIND, title, status: { in: ["OPEN", "IN_PROGRESS"] } } });
    if (open) continue;
    await db.provisioningTask.create({
      data: {
        organisationId: g.organisationId,
        family: "PRODUCTIVITY",
        kind: RECONCILE_KIND,
        title,
        instructions: ["Found by the nightly licence check.", "", ...gapSteps(g).map((s, i) => `${i + 1}. ${s}`)].join("\n"),
        expectedBy: new Date(now.getTime() + 24 * 3_600_000),
      },
    });
  }
  return gaps;
}
