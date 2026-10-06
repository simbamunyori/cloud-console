import type { PrismaClient } from "@prisma/client";
import { todayIn } from "@/lib/dates";
import { money } from "@/lib/domain/money";
import { priceDay } from "@/lib/domain/pricing";
import { PAYMENT_METHODS, type Domain } from "@/server/billing/adapter";
import { tldOffers } from "@/server/catalogue/price-book";
import { productBySlug } from "@/server/catalogue/catalogue";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { queueEmail } from "@/server/email/outbox";
import { assertStartNow, billingFailure, newReference, type OrderDeps } from "@/server/orders/orders";
import { assertCan, can, DomainError } from "@/server/org/access";
import { audit, customerAudit } from "@/server/org/audit";
import { sealValue } from "@/server/partners/vault";
import { activeRegistrar } from "./active";
import { AUTOMATIC_DOMAIN_HOURS } from "./operations";
import { DNS_TYPES, RegistrarError, parseNameservers, type DnsRecord, type DnsType, type Registrar, type RegistrarContact } from "./registrar";

/**
 * What customers do with their domains in the console while a registrar is
 * switched on for the ending (docs/STRATEGY_ROLLOUT.md, U1): renew,
 * transfer in, change nameservers, DNS records and the owner's contact
 * details, and get the code to move a domain away. Each change goes
 * straight to the registrar and into the organisation's audit log.
 */

const catalogue = (deps: Pick<OrderDeps, "db">) => deps.db as unknown as PrismaClient;

function registrarFailure(e: unknown): never {
  if (e instanceof RegistrarError) {
    if (e.code === "unreachable" || e.code === "auth") throw new DomainError("unavailable", "The domain registry isn't answering right now, so nothing was changed. Try again in a few minutes.");
    throw new DomainError("invalid", e.message.replace(/^Openprovider: /, "The registry said: ").replace(/^\.bw registry: /, "The registry said: "));
  }
  throw e;
}

/** The customer's own domain, and the registrar that manages it now (null while it is handled by staff). */
export async function ownDomain(deps: Pick<OrderDeps, "db" | "billing">, domainId: string): Promise<{ domain: Domain; registrar: Registrar | null }> {
  const domain = (await deps.billing.listDomains()).find((d) => d.domainId === domainId);
  if (!domain) throw new DomainError("not-found", "That domain isn't on your account.");
  return { domain, registrar: await activeRegistrar(catalogue(deps), domain.name) };
}

async function managed(deps: Pick<OrderDeps, "db" | "billing" | "actor">, domainId: string) {
  assertCan(deps.actor, "order");
  const own = await ownDomain(deps, domainId);
  if (!own.registrar) throw new DomainError("unavailable", "Changes to this domain are made by our team for now. Open a support ticket and we'll do it.");
  if (own.domain.status !== "active") throw new DomainError("conflict", `${own.domain.name} can't be changed while it is ${own.domain.status.replace("_", " ")}.`);
  return own as { domain: Domain; registrar: Registrar };
}

const auditDomain = (deps: Pick<OrderDeps, "db" | "actor" | "organisation">, domain: Domain, action: string, summary: string, data?: Record<string, unknown>) =>
  audit(deps.db, customerAudit(deps.actor, deps.organisation.id, { action, summary, targetType: "Domain", targetId: domain.domainId, data: data as object | undefined }));

export async function changeNameservers(deps: Pick<OrderDeps, "db" | "billing" | "actor" | "organisation">, domainId: string, text: string) {
  const { domain, registrar } = await managed(deps, domainId);
  const list = parseNameservers(text);
  if (typeof list === "string") throw new DomainError("invalid", list, "nameservers");
  await registrar.setNameservers(domain.name, list).catch(registrarFailure);
  await auditDomain(deps, domain, "domain.nameservers", `Changed the nameservers of ${domain.name} to ${list.join(", ")}`);
  return list;
}

const RECORD_LIMIT = 100;

/** Records as typed in the form: one row per record. Every row is checked before anything is sent. */
export function parseDnsRecords(rows: { type: string; name: string; value: string; ttl: string; priority: string }[]): DnsRecord[] {
  const records: DnsRecord[] = [];
  const fieldErrors: Record<string, string> = {};
  rows.forEach((row, i) => {
    const type = row.type.trim().toUpperCase();
    const name = row.name.trim().toLowerCase().replace(/^@$/, "");
    const value = row.value.trim();
    if (!type && !name && !value) return;
    if (!DNS_TYPES.includes(type as DnsType)) fieldErrors[`type-${i}`] = "Choose a record type.";
    if (name && !/^(\*\.)?([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?\.)*[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9])?$|^\*$/.test(name)) fieldErrors[`name-${i}`] = "Use letters, numbers, hyphens and dots, or @ for the domain itself.";
    if (!value || value.length > 2000) fieldErrors[`value-${i}`] = "Enter a value.";
    else if (type === "A" && !/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value)) fieldErrors[`value-${i}`] = "An A record points to an IPv4 address, like 203.0.113.10.";
    else if (type === "AAAA" && !/^[0-9a-f:]+$/i.test(value)) fieldErrors[`value-${i}`] = "An AAAA record points to an IPv6 address.";
    const ttl = row.ttl.trim() ? Number(row.ttl) : 3600;
    if (!Number.isInteger(ttl) || ttl < 300 || ttl > 86400) fieldErrors[`ttl-${i}`] = "Between 300 and 86400 seconds.";
    const needsPriority = type === "MX" || type === "SRV";
    const priority = row.priority.trim() ? Number(row.priority) : needsPriority ? 10 : undefined;
    if (priority !== undefined && (!Number.isInteger(priority) || priority < 0 || priority > 65535)) fieldErrors[`priority-${i}`] = "A number from 0 to 65535.";
    records.push({ type: type as DnsType, name, value, ttl, ...(needsPriority ? { priority } : {}) });
  });
  if (records.length > RECORD_LIMIT) throw new DomainError("invalid", `Keep it to ${RECORD_LIMIT} records.`);
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted records.", undefined, fieldErrors);
  return records;
}

export async function dnsFor(deps: Pick<OrderDeps, "db" | "billing" | "actor">, domainId: string) {
  const { domain, registrar } = await managed(deps, domainId);
  if (!registrar.dnsRecords) return { supported: false as const, records: null };
  const records = await registrar.dnsRecords(domain.name).catch(registrarFailure);
  return { supported: true as const, records };
}

export async function saveDns(deps: Pick<OrderDeps, "db" | "billing" | "actor" | "organisation">, domainId: string, records: DnsRecord[]) {
  const { domain, registrar } = await managed(deps, domainId);
  if (!registrar.saveDnsRecords) throw new DomainError("unavailable", "DNS records for this domain are kept where its nameservers point.");
  await registrar.saveDnsRecords(domain.name, records).catch(registrarFailure);
  await auditDomain(deps, domain, "domain.dns", `Changed the DNS records of ${domain.name} (${records.length} ${records.length === 1 ? "record" : "records"})`);
}

export async function contactFor(deps: Pick<OrderDeps, "db" | "billing" | "actor">, domainId: string) {
  const { domain, registrar } = await managed(deps, domainId);
  return registrar.getContact(domain.name).catch(registrarFailure);
}

export async function changeContact(deps: Pick<OrderDeps, "db" | "billing" | "actor" | "organisation">, domainId: string, input: RegistrarContact) {
  const { domain, registrar } = await managed(deps, domainId);
  const fieldErrors: Record<string, string> = {};
  const need: [keyof RegistrarContact, string][] = [
    ["firstName", "Enter a first name."],
    ["lastName", "Enter a last name."],
    ["email", "Enter an email address."],
    ["phone", "Enter a phone number."],
    ["address", "Enter the street address."],
    ["city", "Enter the town or city."],
    ["country", "Choose a country."],
  ];
  for (const [k, msg] of need) if (!String(input[k] ?? "").trim()) fieldErrors[k] = msg;
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) fieldErrors.email = "Enter an email address like name@example.com.";
  if (input.phone && !/^\+\d{1,3}[\s.-]+[\d\s.-]{4,}$/.test(input.phone.trim())) fieldErrors.phone = "Start with the country code and a space, like +267 390 0000.";
  if (input.country && !/^[A-Za-z]{2}$/.test(input.country)) fieldErrors.country = "Choose a country.";
  if (Object.keys(fieldErrors).length) throw new DomainError("invalid", "Check the highlighted fields.", undefined, fieldErrors);
  await registrar.updateContact(domain.name, { ...input, country: input.country.toUpperCase() }).catch(registrarFailure);
  await auditDomain(deps, domain, "domain.contact", `Changed the owner contact of ${domain.name}`);
}

/** The code to move the domain to another registrar. Shown once, never stored. */
export async function transferOutCode(deps: Pick<OrderDeps, "db" | "billing" | "actor" | "organisation">, domainId: string) {
  const { domain, registrar } = await managed(deps, domainId);
  const code = await registrar.authCode(domain.name).catch(registrarFailure);
  await auditDomain(deps, domain, "domain.transfer_code", `Asked for the transfer code of ${domain.name}`);
  return code;
}

/** A renewal: an invoice now, and the registrar renews once it is paid. */
export async function renewDomain(deps: OrderDeps, domainId: string, rawYears: string | number) {
  assertCan(deps.actor, "order");
  const years = Number(rawYears);
  if (!Number.isInteger(years) || years < 1 || years > 5) throw new DomainError("invalid", "Choose between 1 and 5 years.", "years");
  const { domain, registrar } = await ownDomain(deps, domainId);
  if (!registrar) throw new DomainError("unavailable", "Renewals for this domain are arranged by our team. Open a support ticket and we'll do it.");
  if (domain.status !== "active" && domain.status !== "expired") throw new DomainError("conflict", `${domain.name} can't be renewed while it is ${domain.status.replace("_", " ")}.`);
  const open = await deps.db.domainOperation.findFirst({ where: { domain: domain.name, kind: "RENEW", status: { in: ["WAITING_PAYMENT", "SUBMITTED"] } } });
  if (open) throw new DomainError("conflict", `A renewal of ${domain.name} is already waiting${open.billingInvoiceId ? " for its invoice to be paid" : ""}.`);
  const placed = await deps.billing.renewDomain(domainId, years, PAYMENT_METHODS.eft).catch(billingFailure);
  await deps.db.$transaction(async (tx) => {
    await tx.domainOperation.create({
      data: {
        organisationId: deps.organisation.id,
        kind: "RENEW",
        domain: domain.name,
        years,
        registrar: registrar.key,
        billingOrderId: placed.orderId,
        billingInvoiceId: placed.invoiceId ?? null,
        billingDomainId: domain.domainId,
        previousExpiry: domain.expiresOn,
      },
    });
    await audit(tx, customerAudit(deps.actor, deps.organisation.id, { action: "domain.renewal_ordered", summary: `Ordered a ${years}-year renewal of ${domain.name}`, targetType: "Domain", targetId: domain.domainId }));
  });
  return placed;
}

/** Bringing a domain over from another registrar, with the code from it. One year is added, as registries do. */
export async function transferDomainIn(deps: OrderDeps, rawName: string, rawCode: string, startNow?: boolean) {
  assertCan(deps.actor, "order");
  const name = rawName.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const authCode = rawCode.trim();
  if (!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)) throw new DomainError("invalid", "Enter a domain like kgalehill.com.", "domain");
  if (!authCode || authCode.length > 200) throw new DomainError("invalid", "Enter the transfer code from your current provider.", "authCode");
  const registrar = await activeRegistrar(catalogue(deps), name);
  if (!registrar) throw new DomainError("unavailable", "Transfers for this ending are arranged by our team. Open a support ticket and we'll do it.", "domain");
  const market = await catalogue(deps).market.findUniqueOrThrow({ where: { code: deps.organisation.billingMarket } });
  const month = priceDay(todayIn(deps.organisation.timeZone, deps.now));
  const offer = [...(await tldOffers(catalogue(deps), market, month))].sort((a, b) => b.tld.length - a.tld.length).find((o) => name.endsWith(o.tld));
  if (!offer) throw new DomainError("invalid", "We don't sell that ending yet.", "domain");
  const product = await productBySlug(catalogue(deps), DOMAIN_PRODUCT_SLUG);
  if (!product) throw new DomainError("unavailable", "Domains can't be ordered right now.");
  await assertStartNow(deps, startNow);
  const price = money(offer.renew.amountMinor, offer.renew.currency);
  const placed = await deps.billing.transferDomain({ name, years: 1, price, paymentMethod: PAYMENT_METHODS.eft, authCode }).catch(billingFailure);
  const now = deps.now ?? new Date();
  const email = (await deps.db.user.findUnique({ where: { id: deps.actor.userId }, select: { email: true } }))?.email;
  return deps.db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        reference: newReference(),
        organisationId: deps.organisation.id,
        productId: product.id,
        quantity: 1,
        options: { Domain: name, Years: "1", Transfer: "yes" },
        unitPriceMinor: price.amountMinor,
        currency: price.currency,
        monthlyTotalMinor: 0n,
        expectedBy: new Date(now.getTime() + AUTOMATIC_DOMAIN_HOURS * 3_600_000),
        placedById: deps.actor.userId,
        billingOrderId: placed.orderId,
        billingServiceIds: placed.domainIds,
        billingInvoiceId: placed.invoiceId ?? null,
      },
    });
    await tx.domainOperation.create({
      data: {
        organisationId: deps.organisation.id,
        orderId: order.id,
        kind: "TRANSFER",
        domain: name,
        years: 1,
        registrar: registrar.key,
        billingOrderId: placed.orderId,
        billingInvoiceId: placed.invoiceId ?? null,
        billingDomainId: placed.domainIds[0] ?? null,
        // WHMCS keeps the code with its order for its own registrar module; the .bw registry needs it from us, sealed until used.
        authCodeSealed: registrar.transfer ? sealValue(authCode) : null,
      },
    });
    await audit(tx, customerAudit(deps.actor, deps.organisation.id, { action: "domain.transfer_ordered", summary: `Ordered the transfer of ${name} (${order.reference})`, targetType: "Order", targetId: order.id }));
    if (email) await queueEmail(tx, { organisationId: deps.organisation.id, to: email, kind: "order.received", payload: { orderId: order.id } });
    return order;
  });
}

/**
 * Everything the domain page shows. Reads from the registrar only while it
 * manages the domain and the person may change it; a registrar that isn't
 * answering leaves the page working, with the changes held back.
 */
export async function domainPanel(deps: Pick<OrderDeps, "db" | "billing" | "actor">, domainId: string) {
  const { domain, registrar } = await ownDomain(deps, domainId);
  const pending = await deps.db.domainOperation.findMany({ where: { domain: domain.name, status: { in: ["WAITING_PAYMENT", "SUBMITTED"] } }, orderBy: { createdAt: "desc" } });
  const base = { domain, pending, renewable: Boolean(registrar) && (domain.status === "active" || domain.status === "expired") };
  if (!registrar || domain.status !== "active" || !can(deps.actor, "order")) return { ...base, managed: false as const, reachable: true };
  try {
    const [info, contact, dns] = await Promise.all([
      registrar.info(domain.name),
      registrar.getContact(domain.name),
      registrar.dnsRecords ? registrar.dnsRecords(domain.name) : Promise.resolve(undefined),
    ]);
    return { ...base, managed: true as const, reachable: true, nameservers: info?.nameservers ?? [], contact, dns: dns === undefined ? { supported: false as const, records: null } : { supported: true as const, records: dns } };
  } catch (e) {
    if (e instanceof RegistrarError) return { ...base, managed: false as const, reachable: false };
    throw e;
  }
}
