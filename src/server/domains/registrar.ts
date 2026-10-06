import type { Money } from "@/lib/domain/money";

/**
 * A domain registrar the console talks to directly (docs/STRATEGY_ROLLOUT.md,
 * U1): Openprovider for international endings, and the .bw registry once
 * BOCRA accredits us. WHMCS stays the billing engine; registration,
 * renewal and transfer for Openprovider run through its WHMCS registrar
 * module when an order is paid, and everything a customer changes later
 * (nameservers, DNS, contacts, transfer codes) comes straight here.
 */

/** How long a paid domain order takes when a registrar does it, as promised to the customer. */
export const AUTOMATIC_DOMAIN_HOURS = 2;

export type RegistrarKey = "openprovider" | "bw-registry";

export interface RegistrarContact {
  firstName: string;
  lastName: string;
  companyName?: string;
  email: string;
  /** International format, e.g. +267 3900000. */
  phone: string;
  address: string;
  city: string;
  postcode?: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
}

export const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA"] as const;
export type DnsType = (typeof DNS_TYPES)[number];

export interface DnsRecord {
  type: DnsType;
  /** Relative to the domain: "" for the domain itself, "www" for www.example.com. */
  name: string;
  value: string;
  ttl: number;
  /** MX and SRV only. */
  priority?: number;
}

export interface RegistrarDomain {
  name: string;
  /** Plain words from the registrar, e.g. "active". */
  status: string;
  expiresOn?: Date;
  nameservers: string[];
  locked?: boolean;
}

export interface Availability {
  name: string;
  available: boolean;
  premium?: boolean;
}

export interface TldCost {
  register: Money;
  renew: Money;
  transfer?: Money;
}

export interface Registrar {
  readonly key: RegistrarKey;
  /** Signs in and reads something harmless. Answers what it found; throws when it can't. */
  test(): Promise<string>;
  check(names: string[]): Promise<Availability[]>;
  info(name: string): Promise<RegistrarDomain | null>;
  setNameservers(name: string, nameservers: string[]): Promise<void>;
  getContact(name: string): Promise<RegistrarContact | null>;
  updateContact(name: string, contact: RegistrarContact): Promise<void>;
  /** The code another registrar needs to take the domain over. */
  authCode(name: string): Promise<string>;
  /** The domain's DNS records, or null when the registrar holds no zone for it. */
  dnsRecords?(name: string): Promise<DnsRecord[] | null>;
  saveDnsRecords?(name: string, records: DnsRecord[]): Promise<void>;
  /** Our cost for one year of an ending, or null when it isn't sold. */
  cost?(tld: string): Promise<TldCost | null>;
  /**
   * Registries WHMCS has no module for (the .bw registry): the console
   * registers, renews and transfers itself once the order is paid.
   */
  register?(name: string, years: number, contact: RegistrarContact, nameservers: string[]): Promise<{ expiresOn: Date }>;
  renew?(name: string, years: number, currentExpiry: Date): Promise<{ expiresOn: Date }>;
  transfer?(name: string, authCode: string, contact: RegistrarContact): Promise<void>;
}

export class RegistrarError extends Error {
  constructor(
    message: string,
    /** "auth" when the credentials were refused, "not-found" when the domain isn't there. */
    public readonly code: "auth" | "not-found" | "refused" | "unreachable" = "refused",
  ) {
    super(message);
    this.name = "RegistrarError";
  }
}

/** "kgalehill.co.bw" → ["kgalehill", "co.bw"]: the label and the ending without its dot. */
export function splitDomain(name: string, endings: string[]): [string, string] {
  const lower = name.trim().toLowerCase();
  const ending = [...endings].sort((a, b) => b.length - a.length).find((e) => lower.endsWith(e.startsWith(".") ? e : `.${e}`));
  if (ending) {
    const e = ending.replace(/^\./, "");
    return [lower.slice(0, -(e.length + 1)), e];
  }
  const dot = lower.indexOf(".");
  return dot < 0 ? [lower, ""] : [lower.slice(0, dot), lower.slice(dot + 1)];
}

const HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Nameservers as typed: one per line or comma separated, 2 to 6, each a host name. */
export function parseNameservers(text: string): string[] | string {
  const list = [...new Set(text.split(/[\s,]+/).map((s) => s.trim().toLowerCase().replace(/\.$/, "")).filter(Boolean))];
  if (list.length < 2) return "Enter at least two nameservers.";
  if (list.length > 6) return "Enter no more than six nameservers.";
  const bad = list.find((n) => !HOST.test(n));
  if (bad) return `${bad} isn't a nameserver name, like ns1.example.com.`;
  return list;
}
