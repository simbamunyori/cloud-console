import type { LicenceChangeKind } from "@prisma/client";
import { parseCustomFields } from "@/server/backup/provider";

/**
 * The licensing partner behind Microsoft 365 (Microsoft CSP through First
 * Distribution) and Google Workspace (through Digicloud), STRATEGY_ROLLOUT
 * U6. Set up in Admin > Partners. In manual mode, or whenever the API
 * refuses, our team does the work from a setup task as before. The API
 * mode speaks the generic contract in docs/licensing-api.md; a
 * partner-specific adapter is a small class next to this one.
 */

export interface VendorSubscription {
  sku: string;
  name: string;
  quantity: number;
}

export interface VendorUser {
  email: string;
  name: string;
  enabled: boolean;
  skus: string[];
  lastSignInAt: Date | null;
}

export interface VendorCheck {
  key: string;
  title: string;
  ok: boolean;
}

export type VendorConsent = { status: "none" | "pending" | "granted"; link: string | null };

export interface VendorChange {
  kind: LicenceChangeKind;
  email: string;
  name: string;
  sku: string | null;
}

export interface LicensingVendor {
  readonly kind: "manual" | "api";
  test(): Promise<string>;
  /** What the tenant has bought, by SKU. Null when our team checks by hand. */
  subscriptions(tenantRef: string): Promise<VendorSubscription[] | null>;
  /** Sets how many of a SKU the tenant has. False when our team does it by hand. */
  setQuantity(tenantRef: string, sku: string, quantity: number): Promise<boolean>;
  users(tenantRef: string): Promise<VendorUser[] | null>;
  /** Gives or takes a licence, adds or removes a person. False when our team does it by hand. */
  applyChange(tenantRef: string, change: VendorChange): Promise<boolean>;
  /** Whether the customer has given us admin access, and the link to give it. */
  consent(tenantRef: string, domain: string): Promise<VendorConsent | null>;
  /** The tenant's security settings, once access is given. */
  security(tenantRef: string): Promise<VendorCheck[] | null>;
}

export class LicensingVendorError extends Error {}

export class ManualLicensingVendor implements LicensingVendor {
  readonly kind = "manual" as const;
  constructor(private readonly label: string) {}
  async test() {
    return `Manual mode: our team makes ${this.label} changes in the partner portal from setup tasks.`;
  }
  async subscriptions() {
    return null;
  }
  async setQuantity() {
    return false;
  }
  async users() {
    return null;
  }
  async applyChange() {
    return false;
  }
  async consent() {
    return null;
  }
  async security() {
    return null;
  }
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

export interface ApiVendorSettings {
  endpoint: string;
  apiKey: string;
  apiSecret?: string;
  custom: Record<string, string>;
}

export class ApiLicensingVendor implements LicensingVendor {
  readonly kind = "api" as const;
  constructor(
    private readonly s: ApiVendorSettings,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async call(path: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
    const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${this.s.apiKey}` };
    if (this.s.apiSecret) headers["x-api-secret"] = this.s.apiSecret;
    for (const [k, v] of Object.entries(this.s.custom)) headers[`x-${k.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`] = v;
    if (init?.body) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await this.fetcher(`${this.s.endpoint.replace(/\/+$/, "")}${path}`, { method: init?.method ?? "GET", headers, body: init?.body ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      throw new LicensingVendorError(`Couldn't reach the licensing partner: ${(e as Error).message}`);
    }
    if (res.status === 401 || res.status === 403) throw new LicensingVendorError("The licensing partner refused the API key.");
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      throw new LicensingVendorError(`The licensing partner answered ${res.status}${body?.error ? `: ${str(body.error, 200)}` : "."}`);
    }
    if (res.status === 204) return {};
    return res.json().catch(() => {
      throw new LicensingVendorError("The licensing partner's answer wasn't JSON.");
    });
  }

  private customer(tenantRef: string) {
    return `/v1/customers/${encodeURIComponent(tenantRef)}`;
  }

  async test() {
    const body = (await this.call("/v1/ping")) as { account?: string } | null;
    return `Signed in${body?.account ? ` as ${str(body.account, 100)}` : ""}.`;
  }

  async subscriptions(tenantRef: string) {
    const body = (await this.call(`${this.customer(tenantRef)}/subscriptions`)) as { subscriptions?: unknown[] } | null;
    if (!body) return null;
    return (body.subscriptions ?? [])
      .map((r) => {
        const s = (r ?? {}) as Record<string, unknown>;
        const quantity = Number(s.quantity);
        return str(s.sku, 100) && Number.isInteger(quantity) && quantity >= 0 ? { sku: str(s.sku, 100), name: str(s.name, 200) || str(s.sku, 100), quantity } : null;
      })
      .filter((s): s is VendorSubscription => s !== null);
  }

  async setQuantity(tenantRef: string, sku: string, quantity: number) {
    const body = await this.call(`${this.customer(tenantRef)}/subscriptions/${encodeURIComponent(sku)}`, { method: "PATCH", body: { quantity } });
    if (body === null) throw new LicensingVendorError(`The licensing partner has no ${sku} subscription for this customer.`);
    return true;
  }

  async users(tenantRef: string) {
    const body = (await this.call(`${this.customer(tenantRef)}/users`)) as { users?: unknown[] } | null;
    if (!body) return null;
    return (body.users ?? [])
      .map((r) => {
        const u = (r ?? {}) as Record<string, unknown>;
        const email = str(u.email, 200).toLowerCase();
        if (!email.includes("@")) return null;
        const seen = typeof u.lastSignInAt === "string" ? new Date(u.lastSignInAt) : null;
        return { email, name: str(u.name, 200) || email, enabled: u.enabled !== false, skus: Array.isArray(u.skus) ? u.skus.map((x) => str(x, 100)).filter(Boolean) : [], lastSignInAt: seen && !Number.isNaN(seen.getTime()) ? seen : null };
      })
      .filter((u): u is VendorUser => u !== null);
  }

  async applyChange(tenantRef: string, change: VendorChange) {
    await this.call(`${this.customer(tenantRef)}/changes`, { method: "POST", body: { kind: change.kind.toLowerCase(), email: change.email, name: change.name, sku: change.sku } });
    return true;
  }

  async consent(tenantRef: string, domain: string) {
    const body = (await this.call(`${this.customer(tenantRef)}/consent?domain=${encodeURIComponent(domain)}`)) as { status?: unknown; link?: unknown } | null;
    if (!body) return null;
    const status = str(body.status) === "granted" ? "granted" : str(body.status) === "pending" ? "pending" : "none";
    const link = str(body.link, 1000);
    return { status, link: /^https:\/\//.test(link) ? link : null } as VendorConsent;
  }

  async security(tenantRef: string) {
    const body = (await this.call(`${this.customer(tenantRef)}/security`)) as { checks?: unknown[] } | null;
    if (!body) return null;
    return (body.checks ?? [])
      .map((r) => {
        const c = (r ?? {}) as Record<string, unknown>;
        return str(c.key, 100) && str(c.title, 200) ? { key: str(c.key, 100), title: str(c.title, 200), ok: c.ok === true } : null;
      })
      .filter((c): c is VendorCheck => c !== null);
  }
}

/** The adapter from a partner's saved settings: the API, or our team by hand. */
export function licensingVendorFrom(label: string, settings: Record<string, string>, secrets: Record<string, string>, fetcher?: typeof fetch): LicensingVendor {
  if (settings.mode !== "api") return new ManualLicensingVendor(label);
  if (!settings.endpoint || !secrets.apiKey) throw new LicensingVendorError("Enter the API endpoint and key first.");
  return new ApiLicensingVendor({ endpoint: settings.endpoint, apiKey: secrets.apiKey, apiSecret: secrets.apiSecret, custom: parseCustomFields(settings.custom) }, fetcher);
}
