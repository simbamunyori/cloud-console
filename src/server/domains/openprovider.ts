import { money, parseMoney } from "@/lib/domain/money";
import { RegistrarError, splitDomain, type Availability, type DnsRecord, type DnsType, type Registrar, type RegistrarContact, type RegistrarDomain, type TldCost } from "./registrar";

/**
 * Openprovider's REST API (v1beta), for international endings. Credentials
 * are entered in Admin > Partners > Openprovider and never leave the server.
 * https://docs.openprovider.com/doc/all
 */

export const OPENPROVIDER_ENDPOINTS = {
  live: "https://api.openprovider.eu/v1beta",
  sandbox: "http://api.sandbox.openprovider.nl:8480/v1beta",
} as const;

/** Openprovider's own nameservers; DNS records can only be managed here while a domain uses them. */
export const OPENPROVIDER_NAMESERVERS = ["ns1.openprovider.nl", "ns2.openprovider.be", "ns3.openprovider.eu"];

export interface OpenproviderConfig {
  username: string;
  password: string;
  environment: "live" | "sandbox";
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Json = Record<string, unknown>;

const TIMEOUT_MS = 20_000;
/** A sign-in lasts 48 hours at Openprovider; we sign in again well before. */
const TOKEN_MS = 12 * 60 * 60 * 1000;

const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export class OpenproviderRegistrar implements Registrar {
  readonly key = "openprovider" as const;
  private token?: { value: string; at: number };

  constructor(
    private readonly config: OpenproviderConfig,
    private readonly fetchFn: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private get base() {
    return OPENPROVIDER_ENDPOINTS[this.config.environment];
  }

  private async raw(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: Json }> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new RegistrarError("Openprovider didn't answer. Try again in a few minutes.", "unreachable");
    }
    const json = obj(await res.json().catch(() => ({})));
    return { status: res.status, json };
  }

  private async signIn(): Promise<string> {
    if (this.token && this.now() - this.token.at < TOKEN_MS) return this.token.value;
    const { status, json } = await this.raw("POST", "/auth/login", { username: this.config.username, password: this.config.password, ip: "0.0.0.0" });
    const token = str(obj(json.data).token);
    if (status >= 400 || !token) throw new RegistrarError(`Openprovider refused the username or password${json.desc ? ` (${str(json.desc)})` : ""}.`, "auth");
    this.token = { value: token, at: this.now() };
    return token;
  }

  private async call(method: string, path: string, body?: unknown): Promise<Json> {
    let { status, json } = await this.raw(method, path, body, await this.signIn());
    if (status === 401) {
      this.token = undefined;
      ({ status, json } = await this.raw(method, path, body, await this.signIn()));
    }
    const code = Number(json.code ?? 0);
    if (status >= 400 || code !== 0) {
      const desc = str(json.desc) || `HTTP ${status}`;
      throw new RegistrarError(`Openprovider: ${desc}`, status === 404 ? "not-found" : "refused");
    }
    return obj(json.data);
  }

  private split(name: string) {
    const [label, extension] = splitDomain(name, []);
    if (!label || !extension) throw new RegistrarError(`${name} isn't a domain name.`, "refused");
    return { name: label, extension };
  }

  async test() {
    await this.signIn();
    const data = await this.call("GET", "/domains?limit=1");
    const total = Number(data.total ?? arr(data.results).length);
    return `Signed in to Openprovider (${this.config.environment === "live" ? "live" : "sandbox"}). The account holds ${total} ${total === 1 ? "domain" : "domains"}.`;
  }

  async check(names: string[]): Promise<Availability[]> {
    if (!names.length) return [];
    const data = await this.call("POST", "/domains/check", { domains: names.map((n) => this.split(n)), with_price: false });
    const byName = new Map(
      arr(data.results).map((r) => {
        const row = obj(r);
        return [str(row.domain).toLowerCase(), row] as const;
      }),
    );
    return names.map((n) => {
      const row = byName.get(n.toLowerCase());
      return { name: n.toLowerCase(), available: str(row?.status) === "free", premium: Boolean(row?.is_premium) };
    });
  }

  /** The domain's row at Openprovider, or null. */
  private async find(name: string): Promise<Json | null> {
    const { name: label, extension } = this.split(name);
    const data = await this.call("GET", `/domains?domain_name_pattern=${encodeURIComponent(label)}&extension=${encodeURIComponent(extension)}&limit=10`);
    const row = arr(data.results)
      .map(obj)
      .find((r) => `${str(obj(r.domain).name)}.${str(obj(r.domain).extension)}`.toLowerCase() === name.toLowerCase());
    return row ?? null;
  }

  private async requireId(name: string): Promise<{ id: string; row: Json }> {
    const row = await this.find(name);
    if (!row) throw new RegistrarError(`${name} isn't at Openprovider.`, "not-found");
    return { id: str(row.id), row };
  }

  async info(name: string): Promise<RegistrarDomain | null> {
    const row = await this.find(name);
    if (!row) return null;
    const expiry = str(row.expiration_date) || str(row.renewal_date);
    const status = str(row.status).toUpperCase();
    return {
      name: name.toLowerCase(),
      status: STATUS[status] ?? (status.toLowerCase() || "unknown"),
      expiresOn: expiry ? new Date(`${expiry.slice(0, 10)}T00:00:00Z`) : undefined,
      nameservers: arr(row.name_servers).map((n) => str(obj(n).name).toLowerCase()).filter(Boolean),
      locked: row.is_locked === undefined ? undefined : Boolean(row.is_locked),
    };
  }

  async setNameservers(name: string, nameservers: string[]) {
    const { id } = await this.requireId(name);
    await this.call("PUT", `/domains/${id}`, { name_servers: nameservers.map((n) => ({ name: n })) });
  }

  async getContact(name: string): Promise<RegistrarContact | null> {
    const { row } = await this.requireId(name);
    const handle = str(row.owner_handle);
    if (!handle) return null;
    const c = await this.call("GET", `/customers/${encodeURIComponent(handle)}`);
    const n = obj(c.name);
    const a = obj(c.address);
    const p = obj(c.phone);
    return {
      firstName: str(n.first_name),
      lastName: str(n.last_name),
      companyName: str(c.company_name) || undefined,
      email: str(c.email),
      phone: [str(p.country_code), str(p.area_code), str(p.subscriber_number)].filter(Boolean).join(" "),
      address: [str(a.street), str(a.number)].filter(Boolean).join(" "),
      city: str(a.city),
      postcode: str(a.zipcode) || undefined,
      country: str(a.country).toUpperCase(),
    };
  }

  async updateContact(name: string, contact: RegistrarContact) {
    const { row } = await this.requireId(name);
    const handle = str(row.owner_handle);
    if (!handle) throw new RegistrarError(`${name} has no owner contact at Openprovider.`, "not-found");
    await this.call("PUT", `/customers/${encodeURIComponent(handle)}`, toCustomer(contact));
  }

  async authCode(name: string) {
    const { id } = await this.requireId(name);
    const data = await this.call("GET", `/domains/${id}/authcode`);
    const code = str(data.auth_code);
    if (!code) throw new RegistrarError(`Openprovider gave no transfer code for ${name}. It may be locked or too new to move.`);
    return code;
  }

  async dnsRecords(name: string): Promise<DnsRecord[] | null> {
    let data: Json;
    try {
      data = await this.call("GET", `/dns/zones/${encodeURIComponent(name.toLowerCase())}?with_records=true`);
    } catch (e) {
      if (e instanceof RegistrarError && e.code !== "auth" && e.code !== "unreachable") return null;
      throw e;
    }
    return arr(data.records)
      .map(obj)
      .map((r) => fromRecord(r, name))
      .filter((r): r is DnsRecord => r !== null);
  }

  async saveDnsRecords(name: string, records: DnsRecord[]) {
    const zone = name.toLowerCase();
    const current = await this.dnsRecords(zone);
    const wanted = records.map(toRecord);
    if (current === null) {
      await this.call("POST", "/dns/zones", { domain: this.split(zone), type: "master", records: wanted });
      return;
    }
    const key = (r: Json) => JSON.stringify([r.type, r.name, r.value, r.ttl, r.prio ?? null]);
    const have = current.map(toRecord);
    const add = wanted.filter((w) => !have.some((h) => key(h) === key(w)));
    const remove = have.filter((h) => !wanted.some((w) => key(w) === key(h)));
    if (!add.length && !remove.length) return;
    await this.call("PUT", `/dns/zones/${encodeURIComponent(zone)}`, { name: zone, records: { add, remove } });
  }

  async cost(tld: string): Promise<TldCost | null> {
    const extension = tld.replace(/^\./, "");
    const one = async (operation: "create" | "renew" | "transfer") => {
      try {
        const data = await this.call("GET", `/domains/prices?domain.name=example&domain.extension=${encodeURIComponent(extension)}&operation=${operation}&period=1`);
        const reseller = obj(obj(data.price).reseller);
        const currency = str(reseller.currency).toUpperCase();
        const price = Number(reseller.price);
        if (!currency || !Number.isFinite(price) || price < 0) return null;
        return money(parseMoney(price.toFixed(2), currency), currency);
      } catch (e) {
        if (e instanceof RegistrarError && e.code !== "auth" && e.code !== "unreachable") return null;
        throw e;
      }
    };
    const [register, renew, transfer] = [await one("create"), await one("renew"), await one("transfer")];
    if (!register || !renew) return null;
    return { register, renew, ...(transfer ? { transfer } : {}) };
  }
}

const STATUS: Record<string, string> = {
  ACT: "active",
  REQ: "being registered",
  PEN: "pending",
  SCH: "scheduled",
  FAI: "failed",
  DEL: "deleted",
  EXP: "expired",
};

const RELATIVE = (fqdn: string, zone: string) => {
  const n = fqdn.toLowerCase().replace(/\.$/, "");
  const z = zone.toLowerCase();
  if (n === z || n === "") return "";
  return n.endsWith(`.${z}`) ? n.slice(0, -(z.length + 1)) : n;
};

function fromRecord(r: Json, zone: string): DnsRecord | null {
  const type = str(r.type).toUpperCase() as DnsType;
  // The zone's own SOA and NS records belong to Openprovider; they aren't shown or changed here.
  if (!["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA"].includes(type)) return null;
  const prio = r.prio === undefined || r.prio === null || r.prio === "" ? undefined : Number(r.prio);
  return { type, name: RELATIVE(str(r.name), zone), value: str(r.value), ttl: Number(r.ttl) || 3600, ...(prio !== undefined && (type === "MX" || type === "SRV") ? { priority: prio } : {}) };
}

function toRecord(r: DnsRecord): Json {
  return { type: r.type, name: r.name, value: r.value, ttl: r.ttl, ...(r.priority !== undefined ? { prio: r.priority } : {}) };
}

/** Openprovider wants the phone split: "+267 390 0000" → country code +267, number 3900000. The country code must be followed by a space. */
export function splitPhone(phone: string) {
  const m = /^\s*\+(\d{1,3})[\s.-]+(.+)$/.exec(phone);
  const rest = (m ? m[2] : phone).replace(/\D/g, "");
  return { country_code: m ? `+${m[1]}` : "", area_code: "", subscriber_number: rest };
}

function toCustomer(c: RegistrarContact): Json {
  return {
    name: { first_name: c.firstName, last_name: c.lastName },
    ...(c.companyName ? { company_name: c.companyName } : {}),
    email: c.email,
    phone: splitPhone(c.phone),
    address: { street: c.address, number: "", city: c.city, zipcode: c.postcode ?? "", country: c.country.toUpperCase() },
  };
}
