import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, StubDomain, StubInvoice, StubInvoiceItem, StubService, StubTransaction } from "@prisma/client";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { addMonths, daysBetween, formatRange, todayIn } from "@/lib/dates";
import { applyBps, divRound, isSupportedCurrency, money, sum } from "@/lib/domain/money";
import {
  type BillingAdapter,
  type BillingClient,
  type BillingClientPatch,
  type BillingCycle,
  BillingError,
  type BillingOrder,
  type BillingProduct,
  type DateFilter,
  type Domain,
  type DomainAvailability,
  type DomainRequest,
  type DomainStatus,
  type DomainTransferRequest,
  type ImportedDomain,
  type ImportedService,
  checkImported,
  checkInvoiceLines,
  CYCLE_MONTHS as MONTHS_IN,
  type Invoice,
  type InvoiceFilter,
  type InvoiceLineKind,
  type InvoiceStatus,
  type InvoiceSummary,
  type ModuleAction,
  type NewBillingClient,
  type NewInvoice,
  type NewOrder,
  type NewPayMethod,
  type OrderStatus,
  type PayMethod,
  type PlacedOrder,
  type RecordedPayment,
  type Service,
  type ServiceChange,
  type ServiceDetails,
  type ServiceStatus,
  type TldPrice,
  type Transaction,
  type UpgradePreview,
  type AcceptOptions,
  type DomainPatch,
} from "../adapter";

/**
 * A stand-in for WHMCS that keeps its state in the Stub* tables, so that
 * ordering, paying and cancelling can be tried end to end before WHMCS is
 * bought. It stores what WHMCS stores (status words, invoice numbers,
 * item types) so the seed data reads like the real thing, and it follows
 * WHMCS rules where the console depends on them: orders cancel only while
 * pending, an invoice is paid once payments cover it, and so on.
 *
 * Simplifications, listed in docs/whmcs-mapping.md: a downgrade mid-period
 * gives no credit, and a domain renewal extends the expiry date when it is
 * ordered rather than when it is paid.
 */

type Tx = Prisma.TransactionClient;

export interface StubOptions {
  now?: () => Date;
  /**
   * Tax on taxed lines, in basis points, for every client. When unset the
   * stub uses its tax rules by client country, as WHMCS does.
   */
  taxRateBps?: number;
  /** Days between an invoice's date and its due date. */
  invoiceTermsDays?: number;
  /** Monthly invoices are raised this many days before services fall due (WHMCS default 14; we use 7). */
  invoiceLeadDays?: number;
}

const SERVICE_STATUS: Record<string, ServiceStatus> = {
  Pending: "pending",
  Active: "active",
  Suspended: "suspended",
  Terminated: "terminated",
  Cancelled: "cancelled",
};
const INVOICE_STATUS: Record<string, InvoiceStatus> = {
  Draft: "draft",
  Unpaid: "unpaid",
  Paid: "paid",
  Cancelled: "cancelled",
  Refunded: "refunded",
  Collections: "collections",
  "Payment Pending": "payment_pending",
};
const INVOICE_STATUS_WORD = Object.fromEntries(Object.entries(INVOICE_STATUS).map(([k, v]) => [v, k])) as Record<InvoiceStatus, string>;
const DOMAIN_STATUS: Record<string, DomainStatus> = {
  Pending: "pending",
  "Pending Transfer": "pending_transfer",
  Active: "active",
  Expired: "expired",
  Cancelled: "cancelled",
  "Transferred Away": "transferred_away",
};
const ORDER_STATUS: Record<string, OrderStatus> = { Pending: "pending", Active: "active", Cancelled: "cancelled", Fraud: "fraud" };
const LINE_KIND: Record<string, InvoiceLineKind> = {
  Hosting: "service",
  Domain: "domain",
  DomainRegister: "domain",
  DomainTransfer: "domain",
  Setup: "setup",
  ProRata: "prorata",
  Upgrade: "upgrade",
  Item: "item",
};
const CYCLE_WORD: Record<BillingCycle, string> = { monthly: "Monthly", quarterly: "Quarterly", semiannually: "Semi-Annually", annually: "Annually" };
const CYCLE_OF = Object.fromEntries(Object.entries(CYCLE_WORD).map(([k, v]) => [v, k])) as Record<string, BillingCycle>;
const CYCLE_MONTHS: Record<string, number> = Object.fromEntries(Object.entries(CYCLE_WORD).map(([k, v]) => [v, MONTHS_IN[k as BillingCycle]]));

/** Suspension reason the stub uses for unpaid invoices; paying clears it. */
export const OVERDUE_REASON = "Overdue on payment";

interface OrderItemRecord {
  kind: "service" | "domain" | "upgrade" | "renewal";
  productId?: string;
  quantity?: number;
  domain?: string;
  amount: string;
  currency: string;
}

interface NewLine {
  type: string;
  relId?: number;
  description: string;
  amount: bigint;
  taxed?: boolean;
}

const id = (value: string, what: string) => {
  if (!/^\d+$/.test(value)) throw new BillingError("not-found", `No ${what} ${value}.`);
  return Number(value);
};

export const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export class StubBillingAdapter implements BillingAdapter {
  readonly provider = "STUB" as const;
  private readonly now: () => Date;
  private readonly taxRateBps: number | undefined;
  private readonly termsDays: number;
  private readonly leadDays: number;

  constructor(
    private readonly db: PrismaClient,
    options: StubOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.taxRateBps = options.taxRateBps;
    this.termsDays = options.invoiceTermsDays ?? 7;
    this.leadDays = options.invoiceLeadDays ?? 7;
  }

  private today() {
    return todayIn(DEFAULT_TIME_ZONE, this.now());
  }

  // ─── Clients ──────────────────────────────────────────────────────

  async getClient(clientId: string): Promise<BillingClient | null> {
    const c = await this.db.stubClient.findUnique({ where: { id: id(clientId, "client") } });
    if (!c) return null;
    return {
      clientId: String(c.id),
      companyName: c.companyName,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      country: c.country,
      currency: c.currency,
      address1: c.address1 ?? undefined,
      city: c.city ?? undefined,
      phone: c.phone ?? undefined,
      taxId: c.taxId ?? undefined,
      status: c.status.toLowerCase() as BillingClient["status"],
    };
  }

  async createClient(input: NewBillingClient) {
    if (!isSupportedCurrency(input.currency)) throw new BillingError("invalid", `Currency ${input.currency} is not set up.`);
    if (!input.email.includes("@")) throw new BillingError("invalid", "A client needs an email address.");
    const c = await this.db.stubClient.create({
      data: {
        companyName: input.companyName,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        country: input.country,
        currency: input.currency,
        address1: input.address1,
        city: input.city,
        phone: input.phone,
        taxId: input.taxId,
      },
    });
    return { clientId: String(c.id) };
  }

  async updateClient(clientId: string, patch: BillingClientPatch) {
    const { status, ...rest } = patch;
    const updated = await this.db.stubClient.updateMany({
      where: { id: id(clientId, "client") },
      data: { ...rest, ...(status ? { status: status[0].toUpperCase() + status.slice(1) } : {}) },
    });
    if (updated.count !== 1) throw new BillingError("not-found", `No client ${clientId}.`);
  }

  private async client(tx: Tx, clientId: string) {
    const c = await tx.stubClient.findUnique({ where: { id: id(clientId, "client") } });
    if (!c) throw new BillingError("not-found", `No client ${clientId}.`);
    return c;
  }

  // ─── Catalogue ────────────────────────────────────────────────────

  async listProducts(filter: { groupId?: string } = {}): Promise<BillingProduct[]> {
    const rows = await this.db.stubProduct.findMany({
      where: filter.groupId ? { gid: Number(filter.groupId) } : {},
      orderBy: { id: "asc" },
    });
    return rows.map((p) => {
      const prices: BillingProduct["prices"] = {};
      for (const [currency, cycles] of Object.entries(p.pricing as Record<string, Record<string, string>>)) {
        const m = (v?: string) => (v === undefined ? undefined : money(BigInt(v), currency));
        prices[currency] = { monthly: m(cycles.monthly), annually: m(cycles.annually), setup: m(cycles.setup) };
      }
      return { productId: String(p.id), groupId: String(p.gid), groupName: p.groupName, name: p.name, type: p.type, prices, hidden: p.hidden };
    });
  }

  // ─── Invoices (shared) ────────────────────────────────────────────

  /** The client's country's tax rule, else the rule for every other country, else none. */
  private async taxRateFor(tx: Tx, clientId: number): Promise<number> {
    if (this.taxRateBps !== undefined) return this.taxRateBps;
    const client = await tx.stubClient.findUnique({ where: { id: clientId }, select: { country: true } });
    const rules = await tx.stubTaxRule.findMany({ where: { country: { in: [client?.country ?? "", "*"] } } });
    return (rules.find((r) => r.country === client?.country) ?? rules.find((r) => r.country === "*"))?.rateBps ?? 0;
  }

  private async raiseInvoice(tx: Tx, clientId: number, currency: string, lines: NewLine[], opts: { date?: Date; dueDate?: Date; notes?: string } = {}) {
    const date = opts.date ?? this.today();
    const subtotal = sum(lines.map((l) => l.amount));
    const taxRateBps = await this.taxRateFor(tx, clientId);
    const tax = applyBps(sum(lines.filter((l) => l.taxed !== false).map((l) => l.amount)), taxRateBps);
    const invoice = await tx.stubInvoice.create({
      data: {
        clientId,
        invoiceNum: `pending-${randomUUID()}`,
        date,
        dueDate: opts.dueDate ?? addDaysUtc(date, this.termsDays),
        status: "Unpaid",
        currency,
        subtotal,
        taxRateBps,
        tax,
        total: subtotal + tax,
        notes: opts.notes,
        items: { create: lines.map((l) => ({ type: l.type, relId: l.relId, description: l.description, amount: l.amount, taxed: l.taxed ?? true })) },
      },
    });
    const invoiceNum = `INV-${date.getUTCFullYear()}-${String(invoice.id).padStart(4, "0")}`;
    await tx.stubInvoice.update({ where: { id: invoice.id }, data: { invoiceNum } });
    return invoice.id;
  }

  async createInvoice(clientId: string, invoice: NewInvoice): Promise<{ invoiceId: string }> {
    return this.db.$transaction(async (tx) => {
      const client = await this.client(tx, clientId);
      checkInvoiceLines(invoice, client.currency);
      const lines: NewLine[] = invoice.lines.map((l) => ({ type: "Item", description: l.description, amount: l.amount.amountMinor, taxed: l.taxed }));
      return { invoiceId: String(await this.raiseInvoice(tx, client.id, client.currency, lines, { date: invoice.issuedOn, dueDate: invoice.dueOn })) };
    });
  }

  // ─── Orders ───────────────────────────────────────────────────────

  async placeOrder(clientId: string, order: NewOrder): Promise<PlacedOrder> {
    if (order.items.length === 0) throw new BillingError("invalid", "An order needs at least one item.");
    const oneOff = order.oneOffLines ?? [];
    if (oneOff.length && !order.createInvoice) throw new BillingError("invalid", "One-off charges need an invoice.");
    return this.db.$transaction(async (tx) => {
      const client = await this.client(tx, clientId);
      for (const line of oneOff) {
        if (line.amount.currency !== client.currency) throw new BillingError("invalid", `This client is billed in ${client.currency}.`);
        if (line.amount.amountMinor < 0n) throw new BillingError("invalid", "A price can't be negative.");
      }
      const today = this.today();
      const products = await tx.stubProduct.findMany({ where: { id: { in: order.items.map((i) => id(i.productId, "product")) } } });
      const records: OrderItemRecord[] = [];
      for (const item of order.items) {
        if (item.recurringPrice.currency !== client.currency) throw new BillingError("invalid", `This client is billed in ${client.currency}.`);
        if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new BillingError("invalid", "Quantity must be at least 1.");
        if (item.recurringPrice.amountMinor < 0n) throw new BillingError("invalid", "A price can't be negative.");
        if (!products.some((p) => p.id === Number(item.productId))) throw new BillingError("not-found", `No product ${item.productId}.`);
        records.push({ kind: "service", productId: item.productId, quantity: item.quantity, domain: item.domain, amount: item.recurringPrice.amountMinor.toString(), currency: client.currency });
      }
      const stubOrder = await tx.stubOrder.create({ data: { clientId: client.id, status: "Pending", items: records as unknown as Prisma.InputJsonValue } });

      const lines: NewLine[] = [];
      const serviceIds: string[] = [];
      for (const item of order.items) {
        const product = products.find((p) => p.id === Number(item.productId))!;
        const cycle = CYCLE_WORD[item.billingCycle];
        const periodEnd = addMonths(today, CYCLE_MONTHS[cycle]);
        const details: ServiceDetails | undefined = item.options && Object.keys(item.options).length
          ? { resources: Object.entries(item.options).map(([label, value]) => ({ label, value })) }
          : undefined;
        const service = await tx.stubService.create({
          data: {
            clientId: client.id,
            productId: product.id,
            orderId: stubOrder.id,
            name: product.name,
            groupName: product.groupName,
            domain: item.domain,
            status: "Pending",
            quantity: item.quantity,
            recurringMinor: item.recurringPrice.amountMinor,
            currency: client.currency,
            billingCycle: cycle,
            regDate: today,
            // With an invoice now, the first period is paid for; otherwise
            // the service joins the next monthly invoice.
            nextDueDate: order.createInvoice ? periodEnd : today,
            details: details as Prisma.InputJsonValue | undefined,
          },
        });
        serviceIds.push(String(service.id));
        if (order.createInvoice) {
          lines.push({ type: "Hosting", relId: service.id, description: serviceLine(product.name, item.quantity, item.domain, today, addDaysUtc(periodEnd, -1)), amount: item.recurringPrice.amountMinor });
          const setup = (product.pricing as Record<string, Record<string, string>>)[client.currency]?.setup;
          if (setup && BigInt(setup) > 0n) lines.push({ type: "Setup", relId: service.id, description: `Setup: ${product.name}`, amount: BigInt(setup) });
        }
      }
      for (const line of oneOff) lines.push({ type: "Item", description: line.description, amount: line.amount.amountMinor });
      let invoiceId: number | undefined;
      if (order.createInvoice) {
        invoiceId = await this.raiseInvoice(tx, client.id, client.currency, lines, { dueDate: today });
        await tx.stubOrder.update({ where: { id: stubOrder.id }, data: { invoiceId } });
      }
      return { orderId: String(stubOrder.id), invoiceId: invoiceId === undefined ? undefined : String(invoiceId), serviceIds, domainIds: [] };
    });
  }

  async acceptOrder(orderId: string, _options?: AcceptOptions) {
    await this.db.$transaction(async (tx) => {
      const order = await tx.stubOrder.findUnique({ where: { id: id(orderId, "order") } });
      if (!order) throw new BillingError("not-found", `No order ${orderId}.`);
      if (order.status !== "Pending") throw new BillingError("conflict", `Order ${orderId} is ${order.status.toLowerCase()}, not pending.`);
      await tx.stubOrder.update({ where: { id: order.id }, data: { status: "Active" } });
      await tx.stubService.updateMany({ where: { orderId: order.id, status: "Pending" }, data: { status: "Active" } });
      const domains = orderDomains(order.items);
      if (domains.length) {
        await tx.stubDomain.updateMany({ where: { clientId: order.clientId, domain: { in: domains }, status: { in: ["Pending", "Pending Transfer"] } }, data: { status: "Active" } });
      }
    });
  }

  async listOrders(clientId: string): Promise<BillingOrder[]> {
    const rows = await this.db.stubOrder.findMany({ where: { clientId: id(clientId, "client") }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return rows.map((o) => {
      const items = o.items as unknown as OrderItemRecord[];
      const currency = items[0]?.currency ?? "BWP";
      return {
        orderId: String(o.id),
        placedAt: o.createdAt,
        status: ORDER_STATUS[o.status] ?? "pending",
        invoiceId: o.invoiceId === null ? undefined : String(o.invoiceId),
        total: money(sum(items.map((i) => BigInt(i.amount))), currency),
      };
    });
  }

  async cancelOrder(orderId: string) {
    await this.db.$transaction(async (tx) => {
      const order = await tx.stubOrder.findUnique({ where: { id: id(orderId, "order") } });
      if (!order) throw new BillingError("not-found", `No order ${orderId}.`);
      if (order.status !== "Pending") throw new BillingError("conflict", "Only a pending order can be cancelled.");
      await tx.stubOrder.update({ where: { id: order.id }, data: { status: "Cancelled" } });
      await tx.stubService.updateMany({ where: { orderId: order.id }, data: { status: "Cancelled" } });
      const domains = orderDomains(order.items);
      if (domains.length) await tx.stubDomain.updateMany({ where: { clientId: order.clientId, domain: { in: domains } }, data: { status: "Cancelled" } });
      if (order.invoiceId !== null) await tx.stubInvoice.updateMany({ where: { id: order.invoiceId, status: "Unpaid" }, data: { status: "Cancelled" } });
    });
  }

  // ─── Services ─────────────────────────────────────────────────────

  async listServices(clientId: string): Promise<Service[]> {
    const rows = await this.db.stubService.findMany({ where: { clientId: id(clientId, "client") }, orderBy: { id: "asc" } });
    return rows.map(toService);
  }

  async getService(clientId: string, serviceId: string): Promise<Service | null> {
    if (!/^\d+$/.test(serviceId)) return null;
    const row = await this.db.stubService.findFirst({ where: { id: Number(serviceId), clientId: id(clientId, "client") } });
    return row ? toService(row) : null;
  }

  async runModuleAction(serviceId: string, action: ModuleAction, reason?: string) {
    const service = await this.db.stubService.findUnique({ where: { id: id(serviceId, "service") } });
    if (!service) throw new BillingError("not-found", `No service ${serviceId}.`);
    const allowed: Record<ModuleAction, { from: string[]; to: string }> = {
      create: { from: ["Pending"], to: "Active" },
      suspend: { from: ["Active"], to: "Suspended" },
      unsuspend: { from: ["Suspended"], to: "Active" },
      terminate: { from: ["Active", "Suspended", "Pending"], to: "Terminated" },
    };
    const rule = allowed[action];
    if (!rule.from.includes(service.status)) throw new BillingError("conflict", `Can't ${action} a service that is ${service.status.toLowerCase()}.`);
    await this.db.stubService.update({
      where: { id: service.id },
      data: { status: rule.to, suspendReason: action === "suspend" ? (reason ?? null) : null },
    });
  }

  private async quote(tx: Tx, serviceId: string, change: ServiceChange) {
    const service = await tx.stubService.findUnique({ where: { id: id(serviceId, "service") } });
    if (!service) throw new BillingError("not-found", `No service ${serviceId}.`);
    if (service.status !== "Active") throw new BillingError("conflict", "Only an active service can be changed.");
    if (change.recurringPrice.currency !== service.currency) throw new BillingError("invalid", `This service is billed in ${service.currency}.`);
    if (change.quantity !== undefined && (!Number.isInteger(change.quantity) || change.quantity < 1)) throw new BillingError("invalid", "Quantity must be at least 1.");
    const periodStart = addMonths(service.nextDueDate, -CYCLE_MONTHS[service.billingCycle]);
    const daysInPeriod = Math.max(1, daysBetween(periodStart, service.nextDueDate));
    const daysLeft = Math.min(daysInPeriod, Math.max(0, daysBetween(this.today(), service.nextDueDate)));
    const difference = change.recurringPrice.amountMinor - service.recurringMinor;
    const preview: UpgradePreview = {
      currentRecurring: money(service.recurringMinor, service.currency),
      newRecurring: change.recurringPrice,
      dueNow: money(divRound(difference * BigInt(daysLeft), BigInt(daysInPeriod)), service.currency),
      daysLeft,
      daysInPeriod,
    };
    return { service, preview };
  }

  async previewUpgrade(serviceId: string, change: ServiceChange) {
    return (await this.quote(this.db as unknown as Tx, serviceId, change)).preview;
  }

  async upgradeService(serviceId: string, change: ServiceChange, _paymentMethod: string) {
    return this.db.$transaction(async (tx) => {
      const { service, preview } = await this.quote(tx, serviceId, change);
      let product = null;
      if (change.productId) {
        product = await tx.stubProduct.findUnique({ where: { id: id(change.productId, "product") } });
        if (!product) throw new BillingError("not-found", `No product ${change.productId}.`);
      }
      const quantity = change.quantity ?? service.quantity;
      const record: OrderItemRecord = { kind: "upgrade", productId: String(product?.id ?? service.productId), quantity, amount: preview.dueNow.amountMinor > 0n ? preview.dueNow.amountMinor.toString() : "0", currency: service.currency };
      const order = await tx.stubOrder.create({ data: { clientId: service.clientId, status: "Active", items: [record] as unknown as Prisma.InputJsonValue } });
      await tx.stubService.update({
        where: { id: service.id },
        data: {
          quantity,
          recurringMinor: change.recurringPrice.amountMinor,
          ...(product ? { productId: product.id, name: product.name, groupName: product.groupName } : {}),
        },
      });
      let invoiceId: number | undefined;
      if (preview.dueNow.amountMinor > 0n) {
        const today = this.today();
        const name = product?.name ?? service.name;
        const what = quantity !== service.quantity ? `${service.quantity} to ${quantity}` : `${service.name} to ${name}`;
        invoiceId = await this.raiseInvoice(tx, service.clientId, service.currency, [
          { type: "Upgrade", relId: service.id, description: `Change to ${name}: ${what} (${formatRange(today, addDaysUtc(service.nextDueDate, -1))})`, amount: preview.dueNow.amountMinor },
        ], { dueDate: today });
        await tx.stubOrder.update({ where: { id: order.id }, data: { invoiceId } });
      }
      return { orderId: String(order.id), invoiceId: invoiceId === undefined ? undefined : String(invoiceId) };
    });
  }

  // ─── Invoices and payments ────────────────────────────────────────

  // ─── Migration ────────────────────────────────────────────────────

  async importService(clientId: string, input: ImportedService) {
    return this.db.$transaction(async (tx) => {
      const client = await this.client(tx, clientId);
      checkImported(input, client.currency);
      const product = await tx.stubProduct.findUnique({ where: { id: id(input.productId, "product") } });
      if (!product) throw new BillingError("not-found", `No product ${input.productId}.`);
      const record: OrderItemRecord = { kind: "service", productId: input.productId, quantity: input.quantity, domain: input.domain, amount: input.recurringPrice.amountMinor.toString(), currency: client.currency };
      const order = await tx.stubOrder.create({ data: { clientId: client.id, status: "Active", items: [record] as unknown as Prisma.InputJsonValue } });
      const service = await tx.stubService.create({
        data: {
          clientId: client.id,
          productId: product.id,
          orderId: order.id,
          name: product.name,
          groupName: product.groupName,
          domain: input.domain,
          status: "Active",
          quantity: input.quantity,
          recurringMinor: input.recurringPrice.amountMinor,
          currency: client.currency,
          billingCycle: CYCLE_WORD[input.billingCycle],
          regDate: input.registeredOn,
          nextDueDate: input.nextDueOn,
        },
      });
      return { serviceId: String(service.id) };
    });
  }

  async importDomain(clientId: string, input: ImportedDomain) {
    const name = input.name.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(name)) throw new BillingError("invalid", `${input.name} isn't a domain name.`);
    if (!Number.isInteger(input.registrationYears) || input.registrationYears < 1 || input.registrationYears > 10) throw new BillingError("invalid", "Choose between 1 and 10 years.");
    return this.db.$transaction(async (tx) => {
      const client = await this.client(tx, clientId);
      checkImported(input, client.currency);
      if (await tx.stubDomain.findUnique({ where: { domain: name } })) throw new BillingError("conflict", `${name} is already with us.`);
      const record: OrderItemRecord = { kind: "domain", domain: name, amount: input.renewal.amountMinor.toString(), currency: client.currency };
      await tx.stubOrder.create({ data: { clientId: client.id, status: "Active", items: [record] as unknown as Prisma.InputJsonValue } });
      const domain = await tx.stubDomain.create({
        data: {
          clientId: client.id,
          domain: name,
          registrar: input.registrar,
          status: "Active",
          regDate: input.registeredOn,
          expiryDate: input.expiresOn,
          nextDueDate: input.nextDueOn,
          // The stub keeps a year's price and multiplies by the years at renewal.
          recurringMinor: input.renewal.amountMinor / BigInt(input.registrationYears),
          currency: client.currency,
          autoRenew: input.autoRenew,
          registrationYears: input.registrationYears,
        },
      });
      return { domainId: String(domain.id) };
    });
  }

  async listInvoices(clientId: string, filter: InvoiceFilter = {}): Promise<InvoiceSummary[]> {
    const rows = await this.db.stubInvoice.findMany({
      where: {
        clientId: id(clientId, "client"),
        ...(filter.status ? { status: INVOICE_STATUS_WORD[filter.status] } : {}),
        ...(filter.from || filter.to ? { date: { gte: filter.from, lte: filter.to } } : {}),
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
    return rows.map(toSummary);
  }

  async getInvoice(clientId: string, invoiceId: string): Promise<Invoice | null> {
    if (!/^\d+$/.test(invoiceId)) return null;
    const row = await this.db.stubInvoice.findFirst({
      where: { id: Number(invoiceId), clientId: id(clientId, "client") },
      include: { items: { orderBy: { id: "asc" } } },
    });
    if (!row) return null;
    const txns = await this.db.stubTransaction.findMany({ where: { invoiceId: row.id }, orderBy: { date: "asc" } });
    return toInvoice(row, row.items, txns);
  }

  async setPurchaseOrder(invoiceId: string, poNumber: string | null) {
    const invoice = await this.db.stubInvoice.findUnique({ where: { id: id(invoiceId, "invoice") } });
    if (!invoice) throw new BillingError("not-found", `No invoice ${invoiceId}.`);
    await this.db.stubInvoice.update({ where: { id: invoice.id }, data: { notes: withPoNote(invoice.notes, poNumber) } });
  }

  async recordPayment(invoiceId: string, payment: RecordedPayment) {
    await this.db.$transaction(async (tx) => {
      const invoice = await tx.stubInvoice.findUnique({ where: { id: id(invoiceId, "invoice") }, include: { items: true } });
      if (!invoice) throw new BillingError("not-found", `No invoice ${invoiceId}.`);
      if (invoice.status !== "Unpaid" && invoice.status !== "Payment Pending") throw new BillingError("conflict", `Invoice ${invoice.invoiceNum} is ${invoice.status.toLowerCase()}.`);
      if (payment.amount.currency !== invoice.currency) throw new BillingError("invalid", `Invoice ${invoice.invoiceNum} is in ${invoice.currency}.`);
      if (payment.amount.amountMinor <= 0n) throw new BillingError("invalid", "A payment must be more than zero.");
      if (!payment.reference.trim()) throw new BillingError("invalid", "A payment needs a reference.");
      await tx.stubTransaction.create({
        data: {
          clientId: invoice.clientId,
          invoiceId: invoice.id,
          date: payment.paidAt,
          gateway: payment.gateway,
          transId: payment.reference,
          amountIn: payment.amount.amountMinor,
          currency: invoice.currency,
          description: `Invoice Payment (#${invoice.invoiceNum})`,
        },
      });
      const paid = await tx.stubTransaction.aggregate({ where: { invoiceId: invoice.id }, _sum: { amountIn: true, amountOut: true } });
      const balance = invoice.total - ((paid._sum.amountIn ?? 0n) - (paid._sum.amountOut ?? 0n));
      if (balance <= 0n) {
        await tx.stubInvoice.update({ where: { id: invoice.id }, data: { status: "Paid", datePaid: payment.paidAt } });
        // As WHMCS does with auto-unsuspend: paying brings back services
        // that were suspended for this bill.
        const serviceIds = invoice.items.filter((i) => i.type === "Hosting" && i.relId !== null).map((i) => i.relId!);
        if (serviceIds.length) {
          await tx.stubService.updateMany({ where: { id: { in: serviceIds }, status: "Suspended", suspendReason: OVERDUE_REASON }, data: { status: "Active", suspendReason: null } });
        }
      }
    });
  }

  async listTransactions(clientId: string, filter: DateFilter = {}): Promise<Transaction[]> {
    const rows = await this.db.stubTransaction.findMany({
      where: { clientId: id(clientId, "client"), ...(filter.from || filter.to ? { date: { gte: filter.from, lte: filter.to } } : {}) },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
    return rows.map(toTransaction);
  }

  async listPayMethods(clientId: string): Promise<PayMethod[]> {
    const rows = await this.db.stubPayMethod.findMany({ where: { clientId: id(clientId, "client") }, orderBy: { id: "asc" } });
    return rows.map((p) => ({
      payMethodId: String(p.id),
      kind: p.type === "BankAccount" ? "bank_account" : "card",
      description: p.description,
      cardBrand: p.cardType ?? undefined,
      lastFour: p.lastFour ?? undefined,
      expiry: p.expiryDate ?? undefined,
      isDefault: p.isDefault,
    }));
  }

  async addPayMethod(clientId: string, method: NewPayMethod) {
    if (!/^\d{4}$/.test(method.lastFour)) throw new BillingError("invalid", "The last four digits are needed.");
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(method.expiry)) throw new BillingError("invalid", "The expiry date should look like 08/28.");
    return this.db.$transaction(async (tx) => {
      const client = await this.client(tx, clientId);
      const first = (await tx.stubPayMethod.count({ where: { clientId: client.id } })) === 0;
      if (method.setDefault) await tx.stubPayMethod.updateMany({ where: { clientId: client.id }, data: { isDefault: false } });
      const row = await tx.stubPayMethod.create({
        data: {
          clientId: client.id,
          type: "CreditCard",
          description: `${method.cardBrand} ending ${method.lastFour}`,
          cardType: method.cardBrand,
          lastFour: method.lastFour,
          expiryDate: method.expiry,
          isDefault: method.setDefault || first,
        },
      });
      return { payMethodId: String(row.id) };
    });
  }

  // ─── Domains ──────────────────────────────────────────────────────

  async listDomains(clientId: string): Promise<Domain[]> {
    const rows = await this.db.stubDomain.findMany({ where: { clientId: id(clientId, "client") }, orderBy: { domain: "asc" } });
    return rows.map(toDomain);
  }

  private async tldFor(name: string) {
    const tlds = await this.db.stubTldPrice.findMany();
    return tlds.filter((t) => name.endsWith(t.tld)).sort((a, b) => b.tld.length - a.tld.length)[0];
  }

  async checkDomain(rawName: string): Promise<DomainAvailability> {
    const name = rawName.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(name)) throw new BillingError("invalid", "Enter a domain like yourname.co.bw.");
    const tld = await this.tldFor(name);
    if (!tld) return { name, supported: false, available: false };
    const label = name.slice(0, -tld.tld.length);
    if (label.includes(".")) throw new BillingError("invalid", "Enter the name without a subdomain, like yourname.co.bw.");
    const ours = await this.db.stubDomain.findFirst({ where: { domain: name, status: { notIn: ["Cancelled", "Transferred Away"] } } });
    return { name, supported: true, available: !ours && !tld.takenNames.includes(label) };
  }

  private async domainOrder(clientId: string, request: DomainRequest, kind: "register" | "transfer") {
    const years = request.years;
    if (!Number.isInteger(years) || years < 1 || years > 10) throw new BillingError("invalid", "Choose between 1 and 10 years.");
    const check = await this.checkDomain(request.name);
    if (!check.supported) throw new BillingError("invalid", `We don't sell ${request.name} yet.`);
    if (kind === "register" && !check.available) throw new BillingError("conflict", `${check.name} is already taken.`);
    if (kind === "transfer") {
      const ours = await this.db.stubDomain.findFirst({ where: { domain: check.name, status: { notIn: ["Cancelled", "Transferred Away"] } } });
      if (ours) throw new BillingError("conflict", `${check.name} is already with us.`);
      if (check.available) throw new BillingError("invalid", `${check.name} isn't registered yet, so it can be registered instead.`);
    }
    const tld = (await this.tldFor(check.name))!;
    return this.db.$transaction(async (tx) => {
      const client = await this.client(tx, clientId);
      if (request.price.currency !== client.currency) throw new BillingError("invalid", `This client is billed in ${client.currency}.`);
      const today = this.today();
      const expiry = addMonths(today, 12 * years);
      const record: OrderItemRecord = { kind: "domain", domain: check.name, amount: request.price.amountMinor.toString(), currency: client.currency };
      const order = await tx.stubOrder.create({ data: { clientId: client.id, status: "Pending", items: [record] as unknown as Prisma.InputJsonValue } });
      const domain = await tx.stubDomain.upsert({
        where: { domain: check.name },
        // A cancelled record for the same name is reused, as names are unique.
        update: { clientId: client.id, status: kind === "register" ? "Pending" : "Pending Transfer", regDate: today, expiryDate: expiry, nextDueDate: expiry, registrationYears: years },
        create: {
          clientId: client.id,
          domain: check.name,
          registrar: check.name.endsWith(".bw") ? "cocca" : "openprovider",
          status: kind === "register" ? "Pending" : "Pending Transfer",
          regDate: today,
          expiryDate: expiry,
          nextDueDate: expiry,
          recurringMinor: tld.currency === client.currency ? tld.renew : request.price.amountMinor / BigInt(years),
          currency: client.currency,
          registrationYears: years,
        },
      });
      const invoiceId = await this.raiseInvoice(tx, client.id, client.currency, [
        {
          type: kind === "register" ? "DomainRegister" : "DomainTransfer",
          relId: domain.id,
          description: `${kind === "register" ? "Domain registration" : "Domain transfer"}: ${check.name} (${years} ${years === 1 ? "year" : "years"})`,
          amount: request.price.amountMinor,
        },
      ], { dueDate: today });
      await tx.stubOrder.update({ where: { id: order.id }, data: { invoiceId } });
      return { orderId: String(order.id), invoiceId: String(invoiceId), serviceIds: [], domainIds: [String(domain.id)] };
    });
  }

  async registerDomain(clientId: string, request: DomainRequest) {
    return this.domainOrder(clientId, request, "register");
  }

  async transferDomain(clientId: string, request: DomainTransferRequest) {
    if (!request.authCode.trim()) throw new BillingError("invalid", "The transfer needs the code from your current registrar.");
    return this.domainOrder(clientId, request, "transfer");
  }

  async renewDomain(clientId: string, domainId: string, years: number, _paymentMethod: string) {
    if (!Number.isInteger(years) || years < 1 || years > 10) throw new BillingError("invalid", "Choose between 1 and 10 years.");
    return this.db.$transaction(async (tx) => {
      const domain = await tx.stubDomain.findFirst({ where: { id: id(domainId, "domain"), clientId: id(clientId, "client") } });
      if (!domain) throw new BillingError("not-found", `No domain ${domainId}.`);
      if (domain.status !== "Active" && domain.status !== "Expired") throw new BillingError("conflict", `${domain.domain} can't be renewed while it is ${domain.status.toLowerCase()}.`);
      const amount = domain.recurringMinor * BigInt(years);
      const record: OrderItemRecord = { kind: "renewal", domain: domain.domain, amount: amount.toString(), currency: domain.currency };
      const order = await tx.stubOrder.create({ data: { clientId: domain.clientId, status: "Active", items: [record] as unknown as Prisma.InputJsonValue } });
      const newExpiry = addMonths(domain.expiryDate, 12 * years);
      await tx.stubDomain.update({ where: { id: domain.id }, data: { status: "Active", expiryDate: newExpiry, nextDueDate: newExpiry } });
      const invoiceId = await this.raiseInvoice(tx, domain.clientId, domain.currency, [
        { type: "Domain", relId: domain.id, description: `Domain renewal: ${domain.domain} (${years} ${years === 1 ? "year" : "years"}, to ${newExpiry.toISOString().slice(0, 10)})`, amount },
      ], { dueDate: this.today() });
      await tx.stubOrder.update({ where: { id: order.id }, data: { invoiceId } });
      return { orderId: String(order.id), invoiceId: String(invoiceId) };
    });
  }

  async updateDomain(domainId: string, patch: DomainPatch) {
    const updated = await this.db.stubDomain.updateMany({
      where: { id: id(domainId, "domain") },
      data: { ...(patch.status ? { status: "Active" } : {}), ...(patch.expiresOn ? { expiryDate: patch.expiresOn } : {}), ...(patch.nextDueOn ? { nextDueDate: patch.nextDueOn } : {}) },
    });
    if (!updated.count) throw new BillingError("not-found", `No domain ${domainId}.`);
  }

  async getTldPricing(currency: string): Promise<TldPrice[]> {
    const rows = await this.db.stubTldPrice.findMany({ where: { currency }, orderBy: { tld: "asc" } });
    return rows.map((t) => ({ tld: t.tld, register: money(t.register, t.currency), renew: money(t.renew, t.currency), transfer: money(t.transfer, t.currency) }));
  }

  // ─── The billing run (WHMCS does this itself with its daily cron) ──

  /**
   * Raises one invoice per client for everything falling due within the
   * lead time, and moves each item's next due date on. Returns the ids of
   * the invoices it made. Safe to run as often as you like.
   */
  async runBillingCycle(): Promise<string[]> {
    const today = this.today();
    const horizon = addDaysUtc(today, this.leadDays);
    const made: string[] = [];
    // Only clients with something due: a transaction per client with nothing to bill is wasted work.
    const due = { OR: [{ services: { some: { status: { in: ["Active", "Suspended"] }, nextDueDate: { lte: horizon } } } }, { domains: { some: { status: "Active", autoRenew: true, nextDueDate: { lte: horizon } } } }] };
    const clients = await this.db.stubClient.findMany({ where: { status: "Active", ...due }, select: { id: true, currency: true } });
    for (const client of clients) {
      const invoiceId = await this.db.$transaction(async (tx) => {
        const services = await tx.stubService.findMany({ where: { clientId: client.id, status: { in: ["Active", "Suspended"] }, nextDueDate: { lte: horizon } }, orderBy: { id: "asc" } });
        const domains = await tx.stubDomain.findMany({ where: { clientId: client.id, status: "Active", autoRenew: true, nextDueDate: { lte: horizon } }, orderBy: { id: "asc" } });
        if (!services.length && !domains.length) return undefined;
        const lines: NewLine[] = [];
        let earliestDue = horizon;
        for (const s of services) {
          let due = s.nextDueDate;
          if (due < earliestDue) earliestDue = due;
          while (due <= horizon) {
            const next = addMonths(due, CYCLE_MONTHS[s.billingCycle]);
            lines.push({ type: "Hosting", relId: s.id, description: serviceLine(s.name, s.quantity, s.domain ?? undefined, due, addDaysUtc(next, -1)), amount: s.recurringMinor });
            due = next;
          }
          // Guarded by the old date so two runs at once can't bill twice.
          const moved = await tx.stubService.updateMany({ where: { id: s.id, nextDueDate: s.nextDueDate }, data: { nextDueDate: due } });
          if (moved.count !== 1) throw new BillingError("conflict", "Another billing run got there first.");
        }
        for (const d of domains) {
          if (d.nextDueDate < earliestDue) earliestDue = d.nextDueDate;
          const next = addMonths(d.expiryDate, 12 * d.registrationYears);
          lines.push({ type: "Domain", relId: d.id, description: `Domain renewal: ${d.domain} (${formatRange(d.expiryDate, addDaysUtc(next, -1))})`, amount: d.recurringMinor * BigInt(d.registrationYears) });
          const moved = await tx.stubDomain.updateMany({ where: { id: d.id, nextDueDate: d.nextDueDate }, data: { expiryDate: next, nextDueDate: next } });
          if (moved.count !== 1) throw new BillingError("conflict", "Another billing run got there first.");
        }
        return this.raiseInvoice(tx, client.id, client.currency, lines, { date: today, dueDate: earliestDue < today ? today : earliestDue });
      });
      if (invoiceId !== undefined) made.push(String(invoiceId));
    }
    return made;
  }
}

// ─── Mapping rows to the domain model ────────────────────────────────

function addDaysUtc(d: Date, days: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

function serviceLine(name: string, quantity: number, domain: string | undefined, from: Date, to: Date) {
  const qty = quantity > 1 ? ` x ${quantity}` : "";
  const where = domain ? ` - ${domain}` : "";
  return `${name}${qty}${where} (${formatRange(from, to)})`;
}

function orderDomains(items: Prisma.JsonValue): string[] {
  return ((items as unknown as OrderItemRecord[]) ?? []).filter((i) => i.kind === "domain" && i.domain).map((i) => i.domain!);
}

/** Replaces the "PO: ..." line in invoice notes, keeping anything else. */
export function withPoNote(notes: string | null, poNumber: string | null): string | null {
  const kept = (notes ?? "").split("\n").filter((l) => l.trim() && !l.startsWith("PO: "));
  if (poNumber?.trim()) kept.unshift(`PO: ${poNumber.trim()}`);
  return kept.length ? kept.join("\n") : null;
}

function toService(s: StubService): Service {
  return {
    serviceId: String(s.id),
    productId: String(s.productId),
    orderId: s.orderId === null ? undefined : String(s.orderId),
    name: s.name,
    groupName: s.groupName,
    domain: s.domain ?? undefined,
    status: SERVICE_STATUS[s.status] ?? "pending",
    quantity: s.quantity,
    recurring: money(s.recurringMinor, s.currency),
    billingCycle: CYCLE_OF[s.billingCycle] ?? "monthly",
    registeredOn: s.regDate,
    nextDueOn: s.nextDueDate,
    suspendReason: s.suspendReason ?? undefined,
    details: (s.details as ServiceDetails | null) ?? {},
  };
}

function toSummary(i: StubInvoice): InvoiceSummary {
  return {
    invoiceId: String(i.id),
    number: i.invoiceNum,
    issuedOn: i.date,
    dueOn: i.dueDate,
    paidOn: i.datePaid ?? undefined,
    status: INVOICE_STATUS[i.status] ?? "unpaid",
    total: money(i.total, i.currency),
  };
}

function toTransaction(t: StubTransaction): Transaction {
  return {
    transactionId: String(t.id),
    date: t.date,
    invoiceId: t.invoiceId === null ? undefined : String(t.invoiceId),
    gateway: t.gateway,
    reference: t.transId,
    amountIn: money(t.amountIn, t.currency),
    amountOut: money(t.amountOut, t.currency),
    description: t.description,
  };
}

function toInvoice(i: StubInvoice, items: StubInvoiceItem[], txns: StubTransaction[]): Invoice {
  const paid = sum(txns.map((t) => t.amountIn - t.amountOut));
  const balance = i.status === "Cancelled" || i.status === "Refunded" ? 0n : i.total - paid;
  return {
    ...toSummary(i),
    subtotal: money(i.subtotal, i.currency),
    tax: money(i.tax, i.currency),
    taxRateBps: i.taxRateBps,
    balance: money(balance > 0n ? balance : 0n, i.currency),
    lines: items.map((l) => ({
      lineId: String(l.id),
      kind: LINE_KIND[l.type] ?? "item",
      relatedId: l.relId === null ? undefined : String(l.relId),
      description: l.description,
      amount: money(l.amount, i.currency),
      taxed: l.taxed,
    })),
    payments: txns.map(toTransaction),
    notes: i.notes ?? undefined,
  };
}

function toDomain(d: StubDomain): Domain {
  return {
    domainId: String(d.id),
    name: d.domain,
    registrar: d.registrar,
    status: DOMAIN_STATUS[d.status] ?? "pending",
    registeredOn: d.regDate,
    expiresOn: d.expiryDate,
    nextDueOn: d.nextDueDate,
    renewal: money(d.recurringMinor, d.currency),
    registrationYears: d.registrationYears,
    autoRenew: d.autoRenew,
  };
}

