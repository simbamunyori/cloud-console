import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { BillingAdapter, Service } from "@/server/billing/adapter";
import { BACKUP_PRODUCTS } from "@/server/backup/backup";
import { tenantDb } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { teamOverview } from "@/server/org/members";
import { checkEmailSecurity, cleanDomain, type EmailCheckLookup, type EmailReport } from "@/server/tools/email-check";
import { fullScore, scoreChecks, type ScoreCheck, type ScoreFacts, type ServiceToBackUp } from "./score";

/**
 * Gathers the facts behind the full security score (docs/STRATEGY_ROLLOUT.md,
 * U4) and keeps each organisation's SecurityProfile up to date: nightly for
 * everyone while the feature is on, and when a customer asks to check again.
 */

const INACTIVE_DAYS = 90;
/** The email check reads public DNS; once a day is plenty unless the customer asks. */
const EMAIL_CHECK_HOURS = 20;
const MONITORING_SLUG = "managed-detection-response";
/** Free mailboxes: an owner signing up with one tells us nothing about the business's domain. */
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "gmx.com", "zoho.com", "mail.com"]);

const kindOf = (slug: string): ServiceToBackUp["kind"] | null =>
  slug.startsWith("microsoft-365-") ? "microsoft" : slug.startsWith("google-workspace-") ? "google" : ["web-hosting", "wordpress-hosting"].includes(slug) || slug.startsWith("managed-vps-") ? "server" : null;
const BACKUP_KIND: Record<string, ServiceToBackUp["kind"]> = { "backup-microsoft-365": "microsoft", "backup-google-workspace": "google", "server-backup": "server" };

/** The domain to check: the customer's choice, else a domain on their services, else the owner's work email domain. */
export async function emailDomainFor(db: PrismaClient, organisationId: string, chosen: string | null, services: Service[]): Promise<string | null> {
  if (chosen) return chosen;
  const fromService = services.map((s) => (s.domain ? cleanDomain(s.domain) : null)).find(Boolean);
  if (fromService) return fromService;
  const owner = await db.membership.findFirst({ where: { organisationId, role: "OWNER", active: true }, orderBy: { createdAt: "asc" }, select: { user: { select: { email: true } } } });
  const domain = owner?.user.email.split("@")[1]?.toLowerCase();
  return domain && !FREE_MAIL.has(domain) ? cleanDomain(domain) : null;
}

export async function scoreFacts(db: PrismaClient, organisationId: string, input: { services: Service[]; emailDomain: string | null; email: EmailReport | null; now: Date }): Promise<ScoreFacts> {
  const tenant = tenantDb(organisationId);
  const live = input.services.filter((s) => s.status !== "cancelled" && s.status !== "terminated");
  const [team, products, protections] = await Promise.all([
    teamOverview(tenant, input.now),
    db.product.findMany({ where: { billingProductId: { in: [...new Set(live.map((s) => s.productId))] } }, select: { slug: true, billingProductId: true } }),
    tenant.backupProtection.findMany({ orderBy: { createdAt: "asc" }, select: { billingServiceId: true, label: true, health: true, lastSuccessAt: true } }),
  ]);
  const slugOf = new Map(products.map((p) => [p.billingProductId, p.slug]));
  const serviceSlug = new Map(live.map((s) => [s.serviceId, slugOf.get(s.productId) ?? ""]));

  // Which kind each backup protects: from the included reference, the backup service's product, or its label.
  const byLabel = new Map(Object.entries(BACKUP_PRODUCTS).map(([slug, label]) => [label, slug]));
  const backups: Record<ServiceToBackUp["kind"], NonNullable<ServiceToBackUp["backup"]>[]> = { microsoft: [], google: [], server: [] };
  for (const p of protections) {
    const slug = p.billingServiceId.startsWith("included:") ? p.billingServiceId.split(":").pop()! : (serviceSlug.get(p.billingServiceId) ?? byLabel.get(p.label) ?? "");
    const kind = BACKUP_KIND[slug];
    if (kind) backups[kind].push({ health: p.health, lastSuccessAt: p.lastSuccessAt });
  }
  // One Microsoft 365 or Google Workspace backup covers the whole tenant; each server needs its own.
  let server = 0;
  const services: ServiceToBackUp[] = [];
  for (const s of live) {
    const kind = kindOf(serviceSlug.get(s.serviceId) ?? "");
    if (!kind) continue;
    const backup = kind === "server" ? (backups.server[server++] ?? null) : (backups[kind][0] ?? null);
    services.push({ name: s.name, kind, backup });
  }
  const since = input.now.getTime() - INACTIVE_DAYS * 86_400_000;
  return {
    emailDomain: input.emailDomain,
    email: input.email,
    members: team.members.length,
    withoutTwoStep: team.members.filter((m) => !m.twoStepOn).length,
    inactiveMembers: team.members.filter((m) => m.lastSignIn && m.lastSignIn.getTime() < since).length,
    admins: team.members.filter((m) => m.role === "OWNER" || m.role === "ADMIN").length,
    services,
    hasThreatMonitoring: [...serviceSlug.values()].includes(MONITORING_SLUG),
    // Filled by U5 (device coverage from the security provider) and U6 (workspace settings) once connected.
    devices: null,
    workspace: null,
    now: input.now,
  };
}

export interface RefreshDeps {
  db: PrismaClient;
  adapter: BillingAdapter;
  lookup: EmailCheckLookup;
  now?: Date;
}

/** Scores one organisation and saves it. The email check runs again when it is a day old, the domain changed, or `recheck` asks. */
export async function refreshSecurityProfile(deps: RefreshDeps, organisationId: string, opts: { recheck?: boolean } = {}): Promise<{ score: number; checks: ScoreCheck[] }> {
  const now = deps.now ?? new Date();
  const [profile, account] = await Promise.all([
    deps.db.securityProfile.findUnique({ where: { organisationId } }),
    deps.db.billingAccount.findUnique({ where: { organisationId } }),
  ]);
  const services = account ? await deps.adapter.listServices(account.externalClientId) : [];
  const emailDomain = await emailDomainFor(deps.db, organisationId, profile?.emailDomain ?? null, services);
  let email = (profile?.emailReport as EmailReport | null) ?? null;
  let emailCheckedAt = profile?.emailCheckedAt ?? null;
  const stale = !emailCheckedAt || now.getTime() - emailCheckedAt.getTime() > EMAIL_CHECK_HOURS * 3_600_000;
  if (emailDomain && (opts.recheck || stale || email?.domain !== emailDomain)) {
    try {
      email = await checkEmailSecurity(emailDomain, deps.lookup, now);
      emailCheckedAt = now;
    } catch (e) {
      console.warn(`Security score: email check for ${emailDomain} failed.`, (e as Error).message);
    }
  }
  if (!emailDomain) email = null;
  const checks = scoreChecks(await scoreFacts(deps.db, organisationId, { services, emailDomain, email: email?.domain === emailDomain ? email : null, now }));
  const score = fullScore(checks);
  const data = { emailReport: (email ?? undefined) as unknown as Prisma.InputJsonValue | undefined, emailCheckedAt, score, checks: checks as unknown as Prisma.InputJsonValue, scoredAt: now };
  await deps.db.securityProfile.upsert({ where: { organisationId }, create: { organisationId, ...data }, update: data });
  return { score, checks };
}

/** The nightly run: every organisation, while the feature is on. One failing never stops the rest. */
export async function refreshAllScores(deps: RefreshDeps): Promise<number> {
  if (!(await featureOn(deps.db, "security-score"))) return 0;
  const orgs = await deps.db.organisation.findMany({ where: { deletedAt: null }, select: { id: true } });
  let done = 0;
  for (const o of orgs) {
    try {
      await refreshSecurityProfile(deps, o.id);
      done++;
    } catch (e) {
      console.warn(`Security score: couldn't score ${o.id}.`, (e as Error).message);
    }
  }
  return done;
}
