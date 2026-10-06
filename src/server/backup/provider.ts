import type { BackupHealth } from "@prisma/client";

/**
 * The off-site backup provider behind "Backup" in the console
 * (docs/STRATEGY_ROLLOUT.md, U3). Set up in Admin > Partners > Backup
 * provider. The manual adapter is the fallback: our team reads status in
 * the provider's own portal, records it at /admin/backups and carries out
 * restores as tasks. The API adapter speaks the small JSON contract in
 * docs/backup-provider.md. Customers never see the provider's name.
 */

export interface ProviderStatus {
  /** The provider's reference for one protected account or server. */
  ref: string;
  health: BackupHealth;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  retentionDays: number | null;
  coverage: string | null;
}

export interface RestoreInput {
  ref: string;
  what: string;
  fromDay: string;
  destination: "original" | "alongside";
}

export interface BackupProvider {
  readonly mode: "manual" | "api";
  /** Signs in and reads something harmless; the message says what it found. */
  test(): Promise<string>;
  /** Status for each reference the provider knows. */
  statuses(refs: string[]): Promise<ProviderStatus[]>;
  /** Starts a restore at the provider, or null when our team does it by hand. */
  requestRestore(input: RestoreInput): Promise<{ ref: string } | null>;
}

export class BackupProviderError extends Error {}

export class ManualBackupProvider implements BackupProvider {
  readonly mode = "manual" as const;
  async test() {
    return "Manual mode: our team records backup status at /admin/backups and carries out restores as tasks.";
  }
  async statuses() {
    return [];
  }
  async requestRestore() {
    return null;
  }
}

const HEALTH: Record<string, BackupHealth> = { ok: "OK", success: "OK", warning: "WARNING", failed: "FAILED", error: "FAILED", pending: "PENDING" };

const date = (v: unknown) => {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export interface ApiSettings {
  endpoint: string;
  apiKey: string;
  apiSecret?: string;
  region?: string;
  /** Extra headers or values the provider asks for, "name=value" per line. */
  custom: Record<string, string>;
}

/** The provider's REST API, per docs/backup-provider.md. */
export class ApiBackupProvider implements BackupProvider {
  readonly mode = "api" as const;
  constructor(
    private readonly s: ApiSettings,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async call(path: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
    const url = `${this.s.endpoint.replace(/\/+$/, "")}${path}`;
    const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${this.s.apiKey}` };
    if (this.s.apiSecret) headers["x-api-secret"] = this.s.apiSecret;
    if (this.s.region) headers["x-region"] = this.s.region;
    for (const [k, v] of Object.entries(this.s.custom)) headers[`x-${k.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`] = v;
    if (init?.body) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await this.fetcher(url, { method: init?.method ?? "GET", headers, body: init?.body ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new BackupProviderError(`Couldn't reach the backup provider: ${(e as Error).message}`);
    }
    if (res.status === 401 || res.status === 403) throw new BackupProviderError("The backup provider refused the API key.");
    if (!res.ok) throw new BackupProviderError(`The backup provider answered ${res.status}.`);
    return res.json().catch(() => {
      throw new BackupProviderError("The backup provider's answer wasn't JSON.");
    });
  }

  async test() {
    const body = (await this.call("/v1/ping")) as { account?: string; protected?: number };
    return `Signed in${body.account ? ` as ${body.account}` : ""}${typeof body.protected === "number" ? `, ${body.protected} protected` : ""}.`;
  }

  async statuses(refs: string[]): Promise<ProviderStatus[]> {
    if (!refs.length) return [];
    const body = (await this.call(`/v1/protections?refs=${refs.map(encodeURIComponent).join(",")}`)) as { protections?: Record<string, unknown>[] };
    return (body.protections ?? [])
      .filter((p) => typeof p.ref === "string" && refs.includes(p.ref))
      .map((p) => ({
        ref: p.ref as string,
        health: HEALTH[String(p.health ?? "").toLowerCase()] ?? "WARNING",
        lastSuccessAt: date(p.lastSuccessAt),
        lastAttemptAt: date(p.lastAttemptAt),
        retentionDays: Number.isInteger(p.retentionDays) ? (p.retentionDays as number) : null,
        coverage: typeof p.coverage === "string" ? p.coverage.slice(0, 200) : null,
      }));
  }

  async requestRestore(input: RestoreInput) {
    const body = (await this.call("/v1/restores", { method: "POST", body: input })) as { ref?: string };
    if (typeof body.ref !== "string") throw new BackupProviderError("The backup provider didn't return a restore reference.");
    return { ref: body.ref };
  }
}

/** "name=value" lines to a record; blank lines and lines without "=" are ignored. */
export function parseCustomFields(text: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (text ?? "").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}
