import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeviceHealth, IncidentSeverity } from "@prisma/client";

/**
 * The managed security provider behind the SOC (docs/STRATEGY_ROLLOUT.md,
 * U5). Set up in Admin > Partners > Security provider; several can be
 * stored and one is active. The manual adapter turns each operation into a
 * staff task, with devices, incidents and reports entered by hand. The
 * webhook adapter speaks the generic contract in docs/security-provider.md.
 * A provider-specific adapter is a small class next to these once a
 * partner is chosen. Customers never see the provider's name.
 */

export interface ProviderDevice {
  ref: string;
  name: string;
  os: string | null;
  health: DeviceHealth;
  lastSeenAt: Date | null;
}

export interface ProviderIncident {
  /** The provider's id for the alert, so it is taken once. */
  ref: string;
  tenantRef: string;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  deviceName: string | null;
  /** When the provider resolved it, if it did. */
  resolved: boolean;
}

export interface ProviderReport {
  month: string;
  title: string;
  summary: string | null;
  url: string | null;
}

export interface SecurityProviderAdapter {
  readonly kind: "manual" | "webhook";
  test(): Promise<string>;
  /** A new customer tenant; null means our team creates it by hand. */
  createTenant(input: { organisationName: string; reference: string }): Promise<{ tenantRef: string } | null>;
  /** The agent installer or enrolment link, or null when staff enter it. */
  enrolment(tenantRef: string): Promise<{ link: string; note: string | null } | null>;
  devices(tenantRef: string): Promise<ProviderDevice[] | null>;
  /** Alerts and incidents since a moment, for providers that are polled. */
  incidentsSince(since: Date): Promise<ProviderIncident[]>;
  report(tenantRef: string, month: string): Promise<ProviderReport | null>;
  /** Suspends or removes a tenant; false means our team does it by hand. */
  suspendTenant(tenantRef: string): Promise<boolean>;
  removeTenant(tenantRef: string): Promise<boolean>;
}

export class SecurityProviderError extends Error {}

export class ManualSecurityProvider implements SecurityProviderAdapter {
  readonly kind = "manual" as const;
  async test() {
    return "Manual mode: tenants, devices, incidents and reports are entered by our team at /admin/soc.";
  }
  async createTenant() {
    return null;
  }
  async enrolment() {
    return null;
  }
  async devices() {
    return null;
  }
  async incidentsSince() {
    return [];
  }
  async report() {
    return null;
  }
  async suspendTenant() {
    return false;
  }
  async removeTenant() {
    return false;
  }
}

const SEVERITY: Record<string, IncidentSeverity> = { low: "LOW", info: "LOW", informational: "LOW", medium: "MEDIUM", moderate: "MEDIUM", high: "HIGH", critical: "CRITICAL" };
const HEALTH: Record<string, DeviceHealth> = { healthy: "HEALTHY", ok: "HEALTHY", protected: "HEALTHY", "at-risk": "AT_RISK", at_risk: "AT_RISK", warning: "AT_RISK", offline: "OFFLINE", unprotected: "UNPROTECTED" };

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const date = (v: unknown) => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** An incident as the generic contract sends it, by webhook or when polled. Null when it isn't one. */
export function parseIncident(raw: unknown): ProviderIncident | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ref = str(r.id, 200);
  const tenantRef = str(r.tenant, 200);
  const title = str(r.title, 200);
  if (!ref || !tenantRef || !title) return null;
  return {
    ref,
    tenantRef,
    title,
    summary: str(r.summary, 4000) || title,
    severity: SEVERITY[str(r.severity).toLowerCase()] ?? "MEDIUM",
    deviceName: str(r.device, 200) || null,
    resolved: str(r.status).toLowerCase() === "resolved",
  };
}

/** A device as the generic contract sends it. Null when it isn't one. */
export function parseDevice(raw: unknown): ProviderDevice | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const ref = str(d.id, 200);
  if (!ref) return null;
  return { ref, name: str(d.name, 200) || ref, os: str(d.os, 100) || null, health: HEALTH[str(d.health).toLowerCase()] ?? "AT_RISK", lastSeenAt: date(d.lastSeenAt) };
}

export interface WebhookSettings {
  endpoint: string;
  apiKey: string;
  apiSecret?: string;
  /** Tenant settings and custom fields, sent as headers. */
  custom: Record<string, string>;
}

/** The generic REST contract, per docs/security-provider.md. */
export class WebhookSecurityProvider implements SecurityProviderAdapter {
  readonly kind = "webhook" as const;
  constructor(
    private readonly s: WebhookSettings,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async call(path: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
    const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${this.s.apiKey}` };
    if (this.s.apiSecret) headers["x-api-secret"] = this.s.apiSecret;
    for (const [k, v] of Object.entries(this.s.custom)) headers[`x-${k.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`] = v;
    if (init?.body) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await this.fetcher(`${this.s.endpoint.replace(/\/+$/, "")}${path}`, { method: init?.method ?? "GET", headers, body: init?.body ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new SecurityProviderError(`Couldn't reach the security provider: ${(e as Error).message}`);
    }
    if (res.status === 401 || res.status === 403) throw new SecurityProviderError("The security provider refused the API key.");
    if (res.status === 404) return null;
    if (!res.ok) throw new SecurityProviderError(`The security provider answered ${res.status}.`);
    if (res.status === 204) return {};
    return res.json().catch(() => {
      throw new SecurityProviderError("The security provider's answer wasn't JSON.");
    });
  }

  async test() {
    const body = (await this.call("/v1/ping")) as { account?: string } | null;
    return `Signed in${body?.account ? ` as ${body.account}` : ""}.`;
  }

  async createTenant(input: { organisationName: string; reference: string }) {
    const body = (await this.call("/v1/tenants", { method: "POST", body: { name: input.organisationName, reference: input.reference } })) as { id?: string } | null;
    if (!body?.id) throw new SecurityProviderError("The security provider didn't return a tenant id.");
    return { tenantRef: body.id };
  }

  async enrolment(tenantRef: string) {
    const body = (await this.call(`/v1/tenants/${encodeURIComponent(tenantRef)}/enrolment`)) as { link?: string; note?: string } | null;
    return body?.link && /^https:\/\//.test(body.link) ? { link: body.link, note: str(body.note) || null } : null;
  }

  async devices(tenantRef: string) {
    const body = (await this.call(`/v1/tenants/${encodeURIComponent(tenantRef)}/devices`)) as { devices?: unknown[] } | null;
    return (body?.devices ?? []).map(parseDevice).filter((d): d is ProviderDevice => d !== null);
  }

  async incidentsSince(since: Date) {
    const body = (await this.call(`/v1/incidents?since=${encodeURIComponent(since.toISOString())}`)) as { incidents?: unknown[] } | null;
    return (body?.incidents ?? []).map(parseIncident).filter((i): i is ProviderIncident => i !== null);
  }

  async report(tenantRef: string, month: string) {
    const body = (await this.call(`/v1/tenants/${encodeURIComponent(tenantRef)}/reports/${month}`)) as Record<string, unknown> | null;
    if (!body) return null;
    const url = str(body.url, 1000);
    return { month, title: str(body.title, 200) || `Security report, ${month}`, summary: str(body.summary, 4000) || null, url: /^https:\/\//.test(url) ? url : null };
  }

  async suspendTenant(tenantRef: string) {
    await this.call(`/v1/tenants/${encodeURIComponent(tenantRef)}/suspend`, { method: "POST", body: {} });
    return true;
  }

  async removeTenant(tenantRef: string) {
    await this.call(`/v1/tenants/${encodeURIComponent(tenantRef)}`, { method: "DELETE" });
    return true;
  }
}

/** Webhook signature: hex HMAC-SHA256 of "timestamp.body" with the webhook secret. */
export function signWebhook(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export const WEBHOOK_MAX_AGE_MS = 5 * 60_000;

/** Checks a webhook's signature and age. Returns why it is refused, or null. */
export function verifyWebhook(secret: string, headers: { signature: string | null; timestamp: string | null }, body: string, now = new Date()): string | null {
  if (!headers.signature || !headers.timestamp) return "Missing signature.";
  const at = Number(headers.timestamp) * 1000;
  if (!Number.isFinite(at) || Math.abs(now.getTime() - at) > WEBHOOK_MAX_AGE_MS) return "Too old.";
  const expected = Buffer.from(signWebhook(secret, headers.timestamp, body), "hex");
  const given = Buffer.from(headers.signature.replace(/^sha256=/, ""), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "Bad signature.";
  return null;
}
