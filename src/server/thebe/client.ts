/**
 * Thebe's provisioning API (docs/STRATEGY_ROLLOUT.md, U10), set up in
 * Admin > Partners > Thebe. When Thebe answers, subscribing to a plan
 * creates the customer's Thebe organisation straight away; otherwise the
 * setup task is done by hand. The contract is in docs/thebe-billing.md.
 */

export interface NewThebeOrganisation {
  /** Our organisation id, so a retry never makes a second one. */
  reference: string;
  name: string;
  plan: string;
  users: number;
  owner: { name: string; email: string };
  country: string;
}

export interface ThebeClient {
  readonly kind: "manual" | "api";
  test(): Promise<string>;
  /** Null in manual mode: our team creates it from the setup task. */
  createOrganisation(input: NewThebeOrganisation): Promise<{ id: string; url: string } | null>;
}

export class ThebeError extends Error {}

export class ManualThebe implements ThebeClient {
  readonly kind = "manual";
  async test() {
    return "Manual mode: our team creates each Thebe organisation from its setup task.";
  }
  async createOrganisation() {
    return null;
  }
}

export class ApiThebe implements ThebeClient {
  readonly kind = "api";
  constructor(
    private readonly config: { endpoint: string; apiKey: string },
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async call(method: string, path: string, body?: unknown) {
    let res: Response;
    try {
      res = await this.fetcher(`${this.config.endpoint.replace(/\/+$/, "")}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.config.apiKey}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new ThebeError(`Thebe didn't answer: ${(e as Error).message}`);
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401 || res.status === 403) throw new ThebeError("Thebe refused the API key.");
    if (!res.ok) throw new ThebeError(`Thebe answered ${res.status}${typeof data.error === "string" ? `: ${data.error.slice(0, 300)}` : "."}`);
    return data;
  }

  async test() {
    const data = await this.call("GET", "/v1/ping");
    return typeof data.account === "string" ? `Signed in as ${data.account}.` : "Thebe answered.";
  }

  async createOrganisation(input: NewThebeOrganisation) {
    const data = await this.call("POST", "/v1/organisations", input);
    const id = typeof data.id === "string" ? data.id : null;
    const url = typeof data.url === "string" && /^https:\/\/\S+$/.test(data.url) ? data.url : null;
    if (!id || !url) throw new ThebeError("Thebe didn't send back the organisation's id and address.");
    return { id, url };
  }
}

export function thebeFrom(settings: Record<string, string>, secrets: Record<string, string>, fetcher?: typeof fetch): ThebeClient {
  if (settings.mode !== "api") return new ManualThebe();
  if (!settings.endpoint || !secrets.apiKey) throw new ThebeError("Enter Thebe's API endpoint and key first.");
  return new ApiThebe({ endpoint: settings.endpoint, apiKey: secrets.apiKey }, fetcher);
}
