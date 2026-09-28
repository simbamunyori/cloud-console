import { BillingError } from "../adapter";

/**
 * Transport for the WHMCS API: one POST to includes/api.php per action,
 * with API credentials and responsetype=json. Responses can contain
 * service passwords, so they are never logged.
 */

export interface WhmcsCredentials {
  url: string;
  identifier: string;
  secret: string;
  /** Only when WHMCS uses an access key instead of an IP allowlist. */
  accessKey?: string;
}

export class WhmcsClient {
  constructor(
    private readonly credentials: WhmcsCredentials,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async call<T extends Record<string, unknown> = Record<string, unknown>>(action: string, params: Record<string, string> = {}): Promise<T> {
    const body = new URLSearchParams({
      ...params,
      action,
      identifier: this.credentials.identifier,
      secret: this.credentials.secret,
      responsetype: "json",
      ...(this.credentials.accessKey ? { accesskey: this.credentials.accessKey } : {}),
    });
    const res = await this.fetcher(this.credentials.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new BillingError("not-connected", `WHMCS answered ${action} with HTTP ${res.status}.`);
    const json = (await res.json()) as T & { result?: string; message?: string };
    if (json.result !== "success") {
      // WHMCS messages describe the request, not secrets, so they are safe to show staff.
      throw new BillingError("invalid", `WHMCS refused ${action}: ${json.message ?? "no reason given"}.`);
    }
    return json;
  }
}
