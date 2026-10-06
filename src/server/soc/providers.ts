import type { PrismaClient, SecurityProvider, SecurityProviderType } from "@prisma/client";
import { DomainError } from "@/server/org/access";
import { parseCustomFields } from "@/server/backup/provider";
import { openSecrets, sealSecrets } from "@/server/partners/vault";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { ManualSecurityProvider, SecurityProviderError, WebhookSecurityProvider, type SecurityProviderAdapter } from "./provider";

/**
 * Admin > Partners > Security provider (docs/STRATEGY_ROLLOUT.md, U5):
 * several providers can be stored, one is active. Keys and the webhook
 * secret are sealed and never shown back; every change is audited. Saving
 * new credentials needs a new passing test, and switching the active
 * provider off turns Managed security off too.
 */

export const PROVIDER_TYPES: { value: SecurityProviderType; label: string }[] = [
  { value: "MANUAL", label: "Manual: our team does each step and enters devices, incidents and reports" },
  { value: "WEBHOOK", label: "Generic API and webhook (docs/security-provider.md)" },
];

const SECRET_FIELDS = ["apiKey", "apiSecret", "webhookSecret"] as const;

export interface ProviderInput {
  type: string;
  name: string;
  endpoint: string;
  tenantSettings: string;
  customFields: string;
  apiKey: string;
  apiSecret: string;
  webhookSecret: string;
}

type Settings = { tenantSettings?: string; customFields?: string };

function audit(tx: Pick<PrismaClient, "staffAuditEvent">, staff: StaffActor, action: string, summary: string, data: Record<string, unknown>) {
  return tx.staffAuditEvent.create({ data: { actorUserId: staff.userId, actorLabel: staff.name, action, summary, data: data as object } });
}

/** What the staff page shows: never a secret, only whether it is set. */
export async function providerList(db: Pick<PrismaClient, "securityProvider">) {
  const rows = await db.securityProvider.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  return rows.map((r) => {
    const secrets = openSecrets(r.secrets);
    const settings = (r.settings ?? {}) as Settings;
    return {
      id: r.id,
      type: r.type,
      name: r.name,
      endpoint: r.endpoint ?? "",
      tenantSettings: settings.tenantSettings ?? "",
      customFields: settings.customFields ?? "",
      secretsSet: Object.fromEntries(SECRET_FIELDS.map((f) => [f, Boolean(secrets[f])])) as Record<(typeof SECRET_FIELDS)[number], boolean>,
      active: r.active,
      lastTestAt: r.lastTestAt,
      lastTestOk: r.lastTestOk,
      lastTestMessage: r.lastTestMessage,
    };
  });
}

/** Adds a provider, or changes one. Secrets left empty keep their value. */
export async function saveProvider(deps: { db: PrismaClient; staff: StaffActor }, id: string | null, input: ProviderInput) {
  assertStaffCan(deps.staff, "managePartners");
  const current = id ? await deps.db.securityProvider.findUnique({ where: { id } }) : null;
  if (id && !current) throw new DomainError("not-found", "No such provider.");
  const fieldErrors: Record<string, string> = {};
  const type = input.type as SecurityProviderType;
  const name = input.name.trim();
  const endpoint = input.endpoint.trim();
  if (!PROVIDER_TYPES.some((t) => t.value === type)) fieldErrors.type = "Choose a type.";
  if (!name || name.length > 120) fieldErrors.name = "Enter the provider's name.";
  if (endpoint && !/^https:\/\/[^\s/]+/i.test(endpoint)) fieldErrors.endpoint = "Enter an address starting with https://.";
  if (input.tenantSettings.length > 4000) fieldErrors.tenantSettings = "That's too long.";
  if (input.customFields.length > 4000) fieldErrors.customFields = "That's too long.";
  const secrets: Record<string, string> = { ...openSecrets(current?.secrets) };
  for (const f of SECRET_FIELDS) if (input[f].trim()) secrets[f] = input[f].trim();
  if (type === "WEBHOOK") {
    if (!endpoint) fieldErrors.endpoint = "Enter the API endpoint.";
    if (!secrets.apiKey) fieldErrors.apiKey = "Enter the API key.";
    if (!secrets.webhookSecret) fieldErrors.webhookSecret = "Enter the webhook secret.";
  }
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);

  const settings = { tenantSettings: input.tenantSettings.trim(), customFields: input.customFields.trim() };
  const credentialsChanged = !current || current.type !== type || (current.endpoint ?? "") !== endpoint || SECRET_FIELDS.some((f) => input[f].trim() && openSecrets(current.secrets)[f] !== input[f].trim());
  return deps.db.$transaction(async (tx) => {
    const data = { type, name, endpoint: endpoint || null, settings, secrets: sealSecrets(secrets), updatedById: deps.staff.userId };
    const saved = current
      ? await tx.securityProvider.update({ where: { id: current.id }, data: { ...data, ...(credentialsChanged ? { lastTestOk: null, lastTestMessage: "Changed since the last test.", active: false } : {}) } })
      : await tx.securityProvider.create({ data });
    if (current?.active && credentialsChanged) await tx.featureSwitch.updateMany({ where: { key: "managed-security" }, data: { enabled: false, updatedById: deps.staff.userId, updatedBy: deps.staff.name } });
    await audit(tx, deps.staff, "security-provider.saved", `${current ? "Changed" : "Added"} security provider ${name}`, { id: saved.id, credentialsChanged });
    return saved;
  });
}

export function adapterFor(p: Pick<SecurityProvider, "type" | "endpoint" | "settings" | "secrets">, fetcher?: typeof fetch): SecurityProviderAdapter {
  if (p.type === "MANUAL") return new ManualSecurityProvider();
  const secrets = openSecrets(p.secrets);
  const settings = (p.settings ?? {}) as Settings;
  if (!p.endpoint || !secrets.apiKey) throw new DomainError("invalid", "Enter the API endpoint and key first.");
  return new WebhookSecurityProvider({ endpoint: p.endpoint, apiKey: secrets.apiKey, apiSecret: secrets.apiSecret, custom: { ...parseCustomFields(settings.tenantSettings), ...parseCustomFields(settings.customFields) } }, fetcher);
}

export const webhookSecretOf = (p: Pick<SecurityProvider, "secrets">) => openSecrets(p.secrets).webhookSecret ?? null;

/** Test connection. The result is kept and audited; a failure switches the provider off. */
export async function testProvider(deps: { db: PrismaClient; staff: StaffActor; build?: (p: SecurityProvider) => Pick<SecurityProviderAdapter, "test">; now?: Date }, id: string) {
  assertStaffCan(deps.staff, "managePartners");
  const p = await deps.db.securityProvider.findUnique({ where: { id } });
  if (!p) throw new DomainError("not-found", "No such provider.");
  let ok = true;
  let message: string;
  try {
    message = await (deps.build ?? adapterFor)(p).test();
  } catch (e) {
    ok = false;
    message = e instanceof SecurityProviderError || e instanceof DomainError ? e.message : `The test failed: ${(e as Error).message}`;
  }
  await deps.db.$transaction(async (tx) => {
    await tx.securityProvider.update({ where: { id }, data: { lastTestAt: deps.now ?? new Date(), lastTestOk: ok, lastTestMessage: message.slice(0, 500), ...(ok ? {} : { active: false }) } });
    if (!ok && p.active) await tx.featureSwitch.updateMany({ where: { key: "managed-security" }, data: { enabled: false, updatedById: deps.staff.userId, updatedBy: deps.staff.name } });
    await audit(tx, deps.staff, "security-provider.tested", `Tested security provider ${p.name}: ${ok ? "worked" : "failed"}`, { id, ok });
  });
  return { ok, message };
}

/** Makes one provider the active one (after a passing test), or switches it off, which turns Managed security off too. */
export async function setProviderActive(deps: { db: PrismaClient; staff: StaffActor }, id: string, active: boolean) {
  assertStaffCan(deps.staff, "managePartners");
  const p = await deps.db.securityProvider.findUnique({ where: { id } });
  if (!p) throw new DomainError("not-found", "No such provider.");
  if (active && !p.lastTestOk) throw new DomainError("conflict", "Run a test connection that works first.");
  if (p.active === active) return;
  if (active && (await deps.db.securityTenant.count({ where: { providerId: { not: id }, status: { in: ["PENDING", "ACTIVE", "SUSPENDED"] } } })))
    throw new DomainError("conflict", "Customers have tenants with the current provider. Move or remove them before changing provider.");
  await deps.db.$transaction(async (tx) => {
    if (active) await tx.securityProvider.updateMany({ where: { id: { not: id } }, data: { active: false } });
    await tx.securityProvider.update({ where: { id }, data: { active, updatedById: deps.staff.userId } });
    if (!active) await tx.featureSwitch.updateMany({ where: { key: "managed-security" }, data: { enabled: false, updatedById: deps.staff.userId, updatedBy: deps.staff.name } });
    await audit(tx, deps.staff, active ? "security-provider.active" : "security-provider.off", `${active ? "Made" : "Switched off"} ${p.name}${active ? " the active security provider" : ""}`, { id });
  });
}

export async function activeProvider(db: Pick<PrismaClient, "securityProvider">) {
  return db.securityProvider.findFirst({ where: { active: true } });
}
