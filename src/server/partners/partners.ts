import type { PrismaClient } from "@prisma/client";
import { DomainError } from "@/server/org/access";
import { assertStaffCan, type StaffActor } from "@/server/staff/access";
import { EppRegistry } from "@/server/domains/epp";
import { OPENPROVIDER_NAMESERVERS, OpenproviderRegistrar } from "@/server/domains/openprovider";
import { RegistrarError, parseNameservers, type Registrar } from "@/server/domains/registrar";
import { ApiBackupProvider, BackupProviderError, ManualBackupProvider, parseCustomFields, type BackupProvider } from "@/server/backup/provider";
import { LicensingVendorError, licensingVendorFrom, type LicensingVendor } from "@/server/licences/vendor";
import { ThebeError, thebeFrom } from "@/server/thebe/client";
import { openSecrets, sealSecrets } from "./vault";

/**
 * Admin > Partners (docs/STRATEGY_ROLLOUT.md, rule 5): partner credentials
 * and settings are entered here by Admins, stored sealed, audited, and
 * never shown back. Each partner is off until its test connection works
 * and an Admin switches it on.
 */

export type PartnerKey = "openprovider" | "bw-registry" | "backup-provider" | "microsoft-csp" | "google-reseller" | "thebe";

export interface PartnerField {
  name: string;
  label: string;
  hint?: string;
  kind: "text" | "password" | "select" | "textarea" | "number";
  /** Sealed, never shown back; left empty on a save it keeps the value it had. */
  secret?: boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** What a new set-up starts with. */
  initial?: string;
}

export interface PartnerDefinition {
  label: string;
  description: string;
  fields: PartnerField[];
}


/** The settings both licensing partners share (STRATEGY_ROLLOUT U6). */
function licensingFields(consentHint: string): PartnerField[] {
  return [
    {
      name: "mode",
      label: "How we work with it",
      kind: "select",
      options: [
        { value: "manual", label: "Manual: our team makes each change in the partner portal" },
        { value: "api", label: "API: changes, the daily sync and access checks through the partner's API" },
      ],
      initial: "manual",
    },
    { name: "endpoint", label: "API endpoint", kind: "text", hint: "The base address, e.g. https://api.example.com. Only for API mode." },
    { name: "apiKey", label: "API key", kind: "password", secret: true },
    { name: "apiSecret", label: "API secret", kind: "password", secret: true, hint: "Only if the partner issues one." },
    { name: "consentLink", label: "Admin access link", kind: "text", hint: consentHint },
    { name: "custom", label: "Custom fields", kind: "textarea", hint: "Anything else the partner asks for, one name=value per line, such as a reseller ID. Sent as headers in API mode." },
  ];
}

export const PARTNERS: Record<PartnerKey, PartnerDefinition> = {
  openprovider: {
    label: "Openprovider",
    description:
      "Registers, renews and transfers international domains (.com, .africa, .co.za and the rest), checks availability live and gives us our costs. Customers never see its name.",
    fields: [
      { name: "username", label: "Username", kind: "text", required: true, hint: "The API user from Openprovider's control panel." },
      { name: "password", label: "Password", kind: "password", secret: true, required: true },
      {
        name: "environment",
        label: "Environment",
        kind: "select",
        options: [
          { value: "live", label: "Live" },
          { value: "sandbox", label: "Sandbox (testing, nothing is registered)" },
        ],
        initial: "live",
      },
      { name: "nameservers", label: "Nameservers for new domains", kind: "textarea", initial: OPENPROVIDER_NAMESERVERS.join("\n"), hint: "One per line. With Openprovider's own, customers can edit DNS records in the console." },
    ],
  },
  "bw-registry": {
    label: ".bw registry",
    description: "The .bw and .co.bw registry (BOCRA) over EPP. Built and switched off until BOCRA accredits us; until then .bw domains are a staff task.",
    fields: [
      { name: "host", label: "EPP host", kind: "text", required: true, hint: "From BOCRA, e.g. epp.nic.net.bw." },
      { name: "port", label: "EPP port", kind: "number", initial: "700" },
      { name: "clientId", label: "Registrar ID", kind: "text", required: true },
      { name: "password", label: "EPP password", kind: "password", secret: true, required: true },
      { name: "certificate", label: "Client certificate (PEM)", kind: "textarea", secret: true, hint: "Only if the registry asks for one." },
      { name: "privateKey", label: "Client certificate key (PEM)", kind: "textarea", secret: true },
      { name: "contactPrefix", label: "Contact ID prefix", kind: "text", initial: "FGT" },
      { name: "nameservers", label: "Nameservers for new domains", kind: "textarea", hint: "One per line." },
    ],
  },
  "backup-provider": {
    label: "Backup provider",
    description:
      "Off-site backup for customers' Microsoft 365, Google Workspace and servers (STRATEGY_ROLLOUT U3). White-label: customers see backups under our name only, never the provider's. In manual mode our team records status and carries out restores; with an API, status is fetched every hour and restores go straight to the provider.",
    fields: [
      { name: "name", label: "Provider name", kind: "text", required: true, hint: "For staff only. Never shown to customers." },
      {
        name: "mode",
        label: "How we work with it",
        kind: "select",
        options: [
          { value: "manual", label: "Manual: our team records status and does restores" },
          { value: "api", label: "API: status and restores through the provider's API" },
        ],
        initial: "manual",
      },
      { name: "endpoint", label: "API endpoint", kind: "text", hint: "The base address, e.g. https://api.example.com. Only for API mode." },
      { name: "apiKey", label: "API key", kind: "password", secret: true },
      { name: "apiSecret", label: "API secret", kind: "password", secret: true, hint: "Only if the provider issues one." },
      { name: "region", label: "Storage region", kind: "text", hint: "Where the copies are kept, e.g. South Africa North. Staff only." },
      { name: "custom", label: "Custom fields", kind: "textarea", hint: "Anything else the provider asks for, one name=value per line. Sent as headers in API mode." },
    ],
  },
  "microsoft-csp": {
    label: "Microsoft CSP (First Distribution)",
    description:
      "Microsoft 365 licences through our CSP distributor (STRATEGY_ROLLOUT U6): licence counts and user changes made straight away, a daily licence sync, and the customer's delegated admin access feeding the security score. In manual mode, or when the API refuses, our team does it from a setup task.",
    fields: licensingFields("The delegated admin (GDAP) invitation link customers accept, from Partner Center. {domain} is replaced with the customer's domain. In API mode the partner's own link is used when it gives one."),
  },
  "google-reseller": {
    label: "Google Workspace (Digicloud)",
    description:
      "Google Workspace licences through Digicloud (STRATEGY_ROLLOUT U6): licence counts and user changes made straight away, a daily licence sync, and the customer's reseller admin access feeding the security score. In manual mode, or when the API refuses, our team does it from a setup task.",
    fields: licensingFields("The reseller access link customers accept, from the reseller console. {domain} is replaced with the customer's domain. In API mode the partner's own link is used when it gives one."),
  },
  thebe: {
    label: "Thebe",
    description:
      "Our own expense management product (STRATEGY_ROLLOUT U10). In API mode, a customer subscribing to a Thebe plan gets their Thebe organisation straight away. In manual mode, or when Thebe's API refuses, our team creates it from the setup task.",
    fields: [
      {
        name: "mode",
        label: "How we create organisations",
        kind: "select",
        options: [
          { value: "manual", label: "Manual: our team creates each organisation in Thebe's admin" },
          { value: "api", label: "API: created through Thebe's provisioning API" },
        ],
        initial: "manual",
      },
      { name: "endpoint", label: "API endpoint", kind: "text", hint: "Thebe's provisioning address, e.g. https://api.thebe.africa. Only for API mode." },
      { name: "apiKey", label: "API key", kind: "password", secret: true },
    ],
  },
};

export const isPartnerKey = (k: string): k is PartnerKey => k in PARTNERS;

/** Microsoft CSP and Google Workspace, the licensing partners (U6). */
export const isLicensingPartner = (key: PartnerKey): key is "microsoft-csp" | "google-reseller" => key === "microsoft-csp" || key === "google-reseller";

/** The feature in Admin > Features each partner serves; it goes off whenever the partner does. */
export const FEATURE_OF = {
  openprovider: "openprovider-domains",
  "bw-registry": "bw-registry-domains",
  "backup-provider": "customer-backup",
  "microsoft-csp": "microsoft-licensing",
  "google-reseller": "google-licensing",
  thebe: "thebe-automation",
} as const;

export interface PartnerConfig {
  key: PartnerKey;
  enabled: boolean;
  settings: Record<string, string>;
  secrets: Record<string, string>;
}

type PartnerDb = Pick<PrismaClient, "partnerSetting">;

export async function partnerConfig(db: PartnerDb, key: PartnerKey): Promise<PartnerConfig | null> {
  const row = await db.partnerSetting.findUnique({ where: { key } });
  if (!row) return null;
  return { key, enabled: row.enabled, settings: (row.settings ?? {}) as Record<string, string>, secrets: openSecrets(row.secrets) };
}

/** What the Partners page shows: never a secret, only whether it is set. */
export async function partnerSummary(db: PartnerDb, key: PartnerKey) {
  const row = await db.partnerSetting.findUnique({ where: { key } });
  const definition = PARTNERS[key];
  const secrets = row ? openSecrets(row.secrets) : {};
  const settings = (row?.settings ?? {}) as Record<string, string>;
  return {
    key,
    ...definition,
    enabled: row?.enabled ?? false,
    values: Object.fromEntries(definition.fields.filter((f) => !f.secret).map((f) => [f.name, settings[f.name] ?? f.initial ?? ""])),
    secretsSet: Object.fromEntries(definition.fields.filter((f) => f.secret).map((f) => [f.name, Boolean(secrets[f.name])])),
    lastTestAt: row?.lastTestAt ?? null,
    lastTestOk: row?.lastTestOk ?? null,
    lastTestMessage: row?.lastTestMessage ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

function audit(tx: Pick<PrismaClient, "staffAuditEvent">, staff: StaffActor, action: string, summary: string, data: Record<string, unknown>) {
  return tx.staffAuditEvent.create({ data: { actorUserId: staff.userId, actorLabel: staff.name, action, summary, data: data as object } });
}

/** Saves the settings. Secrets left empty keep their value. A change of credentials needs a new test before it can be used. */
export async function savePartner(deps: { db: PrismaClient; staff: StaffActor }, key: string, input: Record<string, string>) {
  assertStaffCan(deps.staff, "managePartners");
  if (!isPartnerKey(key)) throw new DomainError("not-found", "No such partner.");
  const definition = PARTNERS[key];
  const current = await partnerConfig(deps.db, key);
  const settings: Record<string, string> = {};
  const secrets: Record<string, string> = { ...(current?.secrets ?? {}) };
  const fieldErrors: Record<string, string> = {};
  for (const f of definition.fields) {
    const value = (input[f.name] ?? "").trim();
    if (f.secret) {
      if (value) secrets[f.name] = value;
      if (f.required && !secrets[f.name]) fieldErrors[f.name] = `Enter the ${f.label.toLowerCase()}.`;
      continue;
    }
    if (value.length > 4000) fieldErrors[f.name] = "That's too long.";
    if (f.required && !value) fieldErrors[f.name] = `Enter the ${f.label.toLowerCase()}.`;
    if (f.kind === "select" && value && !f.options?.some((o) => o.value === value)) fieldErrors[f.name] = "Choose one of the options.";
    if (f.kind === "number" && value && !/^\d{1,5}$/.test(value)) fieldErrors[f.name] = "Enter a number.";
    if (f.name === "endpoint" && value && !/^https:\/\/[^\s/]+/i.test(value)) fieldErrors[f.name] = "Enter an address starting with https://.";
    if (f.name === "nameservers" && value) {
      const ns = parseNameservers(value);
      if (typeof ns === "string") fieldErrors[f.name] = ns;
    }
    settings[f.name] = value;
  }
  if (isLicensingPartner(key) && settings.consentLink && !/^https:\/\/\S+$/.test(settings.consentLink)) fieldErrors.consentLink = "Enter an address starting with https://.";
  if ((key === "backup-provider" || key === "microsoft-csp" || key === "google-reseller" || key === "thebe") && settings.mode === "api") {
    if (!settings.endpoint) fieldErrors.endpoint = "Enter the API endpoint.";
    if (!secrets.apiKey) fieldErrors.apiKey = "Enter the API key.";
  }
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);

  const before = current?.settings ?? {};
  const changed = [
    ...definition.fields.filter((f) => !f.secret && (before[f.name] ?? "") !== settings[f.name]).map((f) => f.label),
    ...definition.fields.filter((f) => f.secret && (input[f.name] ?? "").trim() && current?.secrets[f.name] !== secrets[f.name]).map((f) => f.label),
  ];
  if (!changed.length && current) return [];
  await deps.db.$transaction(async (tx) => {
    // New credentials haven't been tested: the partner waits for a passing test before it is used again.
    const credentialsChanged = definition.fields.some((f) => (f.secret || f.required || f.kind === "select") && changed.includes(f.label));
    await tx.partnerSetting.upsert({
      where: { key },
      create: { key, settings, secrets: sealSecrets(secrets), updatedById: deps.staff.userId },
      update: { settings, secrets: sealSecrets(secrets), updatedById: deps.staff.userId, ...(credentialsChanged ? { lastTestOk: null, lastTestMessage: "Changed since the last test.", enabled: false } : {}) },
    });
    if (credentialsChanged) await tx.featureSwitch.updateMany({ where: { key: FEATURE_OF[key] }, data: { enabled: false, updatedById: deps.staff.userId, updatedBy: deps.staff.name } });
    await audit(tx, deps.staff, "partner.saved", `Changed ${definition.label}: ${changed.join(", ") || "first set-up"}`, { key, fields: changed });
  });
  return changed;
}

/** Builds the partner's adapter from saved settings, enabled or not (for the test). */
export function registrarFrom(config: PartnerConfig): Registrar {
  const s = config.settings;
  const x = config.secrets;
  if (config.key === "openprovider") {
    if (!s.username || !x.password) throw new DomainError("invalid", "Enter the Openprovider username and password first.");
    return new OpenproviderRegistrar({ username: s.username, password: x.password, environment: s.environment === "sandbox" ? "sandbox" : "live" });
  }
  if (!s.host || !s.clientId || !x.password) throw new DomainError("invalid", "Enter the registry host, registrar ID and password first.");
  const ns = s.nameservers ? parseNameservers(s.nameservers) : [];
  return new EppRegistry({
    host: s.host,
    port: Number(s.port) || 700,
    clientId: s.clientId,
    password: x.password,
    certificate: x.certificate,
    privateKey: x.privateKey,
    contactPrefix: s.contactPrefix || "FGT",
    nameservers: Array.isArray(ns) ? ns : [],
  });
}

/** The backup provider's adapter from saved settings: the API, or our team by hand. */
export function backupProviderFrom(config: PartnerConfig, fetcher?: typeof fetch): BackupProvider {
  const s = config.settings;
  if (s.mode !== "api") return new ManualBackupProvider();
  if (!s.endpoint || !config.secrets.apiKey) throw new DomainError("invalid", "Enter the API endpoint and key first.");
  return new ApiBackupProvider({ endpoint: s.endpoint, apiKey: config.secrets.apiKey, apiSecret: config.secrets.apiSecret, region: s.region, custom: parseCustomFields(s.custom) }, fetcher);
}

/** The licensing partner's adapter from saved settings (U6): the API, or our team by hand. */
export function licensingFrom(config: PartnerConfig, fetcher?: typeof fetch): LicensingVendor {
  return licensingVendorFrom(PARTNERS[config.key].label, config.settings, config.secrets, fetcher);
}


const testerFrom = (config: PartnerConfig): { test(): Promise<string> } =>
  config.key === "backup-provider" ? backupProviderFrom(config) : isLicensingPartner(config.key) ? licensingFrom(config) : config.key === "thebe" ? thebeFrom(config.settings, config.secrets) : registrarFrom(config);

/** Test connection: signs in and reads something harmless. The result is kept and audited. */
export async function testPartner(deps: { db: PrismaClient; staff: StaffActor; build?: (c: PartnerConfig) => { test(): Promise<string> }; now?: Date }, key: string) {
  assertStaffCan(deps.staff, "managePartners");
  if (!isPartnerKey(key)) throw new DomainError("not-found", "No such partner.");
  const config = await partnerConfig(deps.db, key);
  if (!config) throw new DomainError("invalid", "Save the settings first.");
  const registrar = (deps.build ?? testerFrom)(config);
  let ok = true;
  let message: string;
  try {
    message = await registrar.test();
  } catch (e) {
    ok = false;
    message = e instanceof RegistrarError || e instanceof BackupProviderError || e instanceof LicensingVendorError || e instanceof ThebeError ? e.message : `The test failed: ${(e as Error).message}`;
  }
  await deps.db.$transaction(async (tx) => {
    await tx.partnerSetting.update({ where: { key }, data: { lastTestAt: deps.now ?? new Date(), lastTestOk: ok, lastTestMessage: message.slice(0, 500), ...(ok ? {} : { enabled: false }) } });
    await audit(tx, deps.staff, "partner.tested", `Tested ${PARTNERS[key].label}: ${ok ? "worked" : "failed"}`, { key, ok });
  });
  return { ok, message };
}

/** Switches a partner on (only after a passing test) or off. Switching off also turns off the features that use it. */
export async function setPartnerEnabled(deps: { db: PrismaClient; staff: StaffActor }, key: string, enabled: boolean) {
  assertStaffCan(deps.staff, "managePartners");
  if (!isPartnerKey(key)) throw new DomainError("not-found", "No such partner.");
  const row = await deps.db.partnerSetting.findUnique({ where: { key } });
  if (!row) throw new DomainError("invalid", "Save the settings first.");
  if (enabled && !row.lastTestOk) throw new DomainError("conflict", "Run a test connection that works first.");
  if (row.enabled === enabled) return;
  const feature = FEATURE_OF[key];
  await deps.db.$transaction(async (tx) => {
    await tx.partnerSetting.update({ where: { key }, data: { enabled, updatedById: deps.staff.userId } });
    if (!enabled) await tx.featureSwitch.updateMany({ where: { key: feature }, data: { enabled: false, updatedById: deps.staff.userId, updatedBy: deps.staff.name } });
    await audit(tx, deps.staff, enabled ? "partner.on" : "partner.off", `${enabled ? "Switched on" : "Switched off"} ${PARTNERS[key].label}`, { key });
  });
}
