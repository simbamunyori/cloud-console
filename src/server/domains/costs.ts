import type { PrismaClient } from "@prisma/client";
import { formatMoney } from "@/lib/domain/money";
import { company } from "@/config/app";
import type { StaffActor } from "@/server/staff/access";
import { isBwDomain, registrarByKey } from "./active";
import type { Registrar } from "./registrar";

/**
 * Our cost for each domain ending, from Openprovider into the catalogue
 * (docs/STRATEGY_ROLLOUT.md, U1). The selling price then follows the
 * automated 14-day price books like any other cost (src/server/pricing).
 * .bw endings keep the costs staff enter.
 */

export interface CostSync {
  updated: string[];
  unchanged: string[];
  /** Endings Openprovider didn't price. */
  missing: string[];
}

export async function syncDomainCosts(deps: { db: PrismaClient; registrar?: Registrar | null; staff?: StaffActor; now?: Date }): Promise<CostSync | null> {
  const registrar = deps.registrar === undefined ? await registrarByKey(deps.db, "openprovider") : deps.registrar;
  if (!registrar?.cost) return null;
  const now = deps.now ?? new Date();
  const tlds = await deps.db.tld.findMany({ orderBy: { sortOrder: "asc" } });
  const result: CostSync = { updated: [], unchanged: [], missing: [] };
  const changes: string[] = [];
  for (const t of tlds) {
    if (isBwDomain(`x${t.tld}`)) continue;
    const cost = await registrar.cost(t.tld);
    if (!cost || cost.register.currency !== cost.renew.currency) {
      result.missing.push(t.tld);
      continue;
    }
    const same = t.costRegisterMinor === cost.register.amountMinor && t.costRenewMinor === cost.renew.amountMinor && t.costCurrency === cost.register.currency;
    await deps.db.tld.update({
      where: { tld: t.tld },
      data: { costRegisterMinor: cost.register.amountMinor, costRenewMinor: cost.renew.amountMinor, costCurrency: cost.register.currency, costSource: "openprovider", costSyncedAt: now },
    });
    if (same) {
      result.unchanged.push(t.tld);
      continue;
    }
    result.updated.push(t.tld);
    changes.push(`${t.tld} ${formatMoney(cost.register, company.staffLocale)} to register, ${formatMoney(cost.renew, company.staffLocale)} to renew`);
  }
  if (changes.length) {
    await deps.db.staffAuditEvent.create({
      data: {
        actorUserId: deps.staff?.userId ?? "system",
        actorLabel: deps.staff?.name ?? "Openprovider cost sync",
        action: "pricing.domain_costs",
        summary: `Domain costs from Openprovider: ${changes.join("; ")}`.slice(0, 2000),
        data: { updated: result.updated, missing: result.missing },
      },
    });
  }
  return result;
}
