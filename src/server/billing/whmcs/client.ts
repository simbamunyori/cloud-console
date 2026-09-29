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

/** A refusal from WHMCS itself (result "error"), with its message. */
export class WhmcsRefusal extends BillingError {
  constructor(
    readonly action: string,
    readonly whmcsMessage: string,
  ) {
    super(connectionProblem(whmcsMessage) ? "not-connected" : "invalid", `WHMCS refused ${action}: ${whmcsMessage || "no reason given"}.`);
    this.name = "WhmcsRefusal";
  }

  /** WHMCS says the thing asked about doesn't exist ("Client Not Found", "Invoice ID Not Found"). */
  get notFound() {
    return /not found|invalid (client|service|invoice|order|domain) ?id|does not exist/i.test(this.whmcsMessage);
  }
}

/** Messages that mean the console can't use WHMCS at all: credentials, IP or role permissions. */
function connectionProblem(message: string) {
  return /authentication failed|invalid ip|invalid permissions|not allowed|access denied|invalid access key/i.test(message);
}

export interface CallOptions {
  /** A read, safe to try once more if the network drops. Writes are never retried. */
  read?: boolean;
}

export class WhmcsClient {
  constructor(
    private readonly credentials: WhmcsCredentials,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async call<T extends Record<string, unknown> = Record<string, unknown>>(action: string, params: Record<string, string> = {}, options: CallOptions = {}): Promise<T> {
    const body = new URLSearchParams({
      ...params,
      action,
      identifier: this.credentials.identifier,
      secret: this.credentials.secret,
      responsetype: "json",
      ...(this.credentials.accessKey ? { accesskey: this.credentials.accessKey } : {}),
    });
    let res: Response;
    try {
      res = await this.send(body);
    } catch (e) {
      if (!options.read) throw unreachable(action, e);
      try {
        res = await this.send(body);
      } catch (again) {
        throw unreachable(action, again);
      }
    }
    if (!res.ok && res.status !== 400 && res.status !== 403) throw new BillingError("not-connected", `WHMCS answered ${action} with HTTP ${res.status}.`);
    let json: T & { result?: string; message?: string };
    try {
      json = (await res.json()) as T & { result?: string; message?: string };
    } catch {
      throw new BillingError("not-connected", `WHMCS answered ${action} with something that isn't JSON (HTTP ${res.status}).`);
    }
    // WHMCS messages describe the request, not secrets, so they are safe to show staff.
    if (json.result !== "success") throw new WhmcsRefusal(action, String(json.message ?? ""));
    return json;
  }

  private send(body: URLSearchParams) {
    return this.fetcher(this.credentials.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  }
}

function unreachable(action: string, e: unknown) {
  return new BillingError("not-connected", `WHMCS didn't answer ${action}: ${e instanceof Error ? e.message : "network error"}.`);
}
