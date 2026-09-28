import "server-only";
import type { Service } from "@/server/billing/adapter";
import { prisma, type TenantDb } from "@/server/db";
import { INACTIVE_DAYS, type SecurityFacts } from "./security-score";
import { teamOverview } from "./members";

const BACKUP_SLUGS = ["backup-microsoft-365", "backup-google-workspace"];
const MONITORING_SLUG = "managed-detection-response";

/** The facts behind the security score, for the organisation `db` is scoped to and the person looking. */
export async function securityFacts(db: TenantDb, userId: string, liveServices: Service[], now: Date): Promise<SecurityFacts> {
  const [team, backupCodesLeft, products] = await Promise.all([
    teamOverview(db, now),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
    prisma.product.findMany({ where: { billingProductId: { in: [...new Set(liveServices.map((s) => s.productId))] } }, select: { slug: true, categoryKey: true } }),
  ]);
  const since = now.getTime() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;
  return {
    withoutTwoStep: team.members.filter((m) => !m.twoStepOn).length,
    backupCodesLeft,
    // Someone who has never signed in is still setting up, not inactive.
    inactiveMembers: team.members.filter((m) => m.lastSignIn && m.lastSignIn.getTime() < since).length,
    admins: team.members.filter((m) => m.role === "OWNER" || m.role === "ADMIN").length,
    hasProductivity: products.some((p) => p.categoryKey === "productivity"),
    hasMailboxBackup: products.some((p) => BACKUP_SLUGS.includes(p.slug)),
    hasThreatMonitoring: products.some((p) => p.slug === MONITORING_SLUG),
  };
}
