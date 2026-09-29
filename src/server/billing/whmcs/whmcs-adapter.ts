import { randomBytes } from "node:crypto";
import { money } from "@/lib/domain/money";
import type {
  BillingAdapter,
  BillingClient,
  BillingClientPatch,
  BillingOrder,
  BillingProduct,
  DateFilter,
  Domain,
  DomainAvailability,
  DomainRequest,
  DomainTransferRequest,
  Invoice,
  InvoiceFilter,
  InvoiceSummary,
  ModuleAction,
  NewBillingClient,
  NewOrder,
  NewPayMethod,
  PayMethod,
  PlacedOrder,
  RecordedPayment,
  Service,
  ServiceChange,
  TldPrice,
  Transaction,
  UpgradePreview,
} from "../adapter";
import { BillingError, PAYMENT_METHODS } from "../adapter";
import { DOMAIN_PATTERN, withPoNote } from "../stub/stub-adapter";
import { WhmcsRefusal, type WhmcsClient } from "./client";
import * as map from "./map";

type Json = Record<string, unknown>;

/** WHMCS pages lists; this many per call. */
const PAGE = 250;

/** How long the TLD list is trusted before it is read again. */
const TLD_CACHE_MS = 5 * 60_000;

/** Domain statuses that no longer hold the name. */
const RELEASED: Domain["status"][] = ["cancelled", "transferred_away"];

const MODULE: Record<ModuleAction, { action: string; from: Service["status"][]; to: Service["status"] }> = {
  create: { action: "ModuleCreate", from: ["pending"], to: "active" },
  suspend: { action: "ModuleSuspend", from: ["active"], to: "suspended" },
  unsuspend: { action: "ModuleUnsuspend", from: ["suspended"], to: "active" },
  terminate: { action: "ModuleTerminate", from: ["active", "suspended", "pending"], to: "terminated" },
};

/**
 * A module refusal meaning the product has no provisioning module (licences
 * and managed services set up by our own team). The status is then changed
 * in WHMCS directly. Any other module failure is shown as it is, so WHMCS
 * never says a service is suspended when the real account isn't.
 */
const NO_MODULE = /no module|module not (found|assigned|active)|not assigned to a module|function not supported|not supported by (the )?module/i;

/**
 * BillingAdapter over the WHMCS API. Each method calls the actions named in
 * adapter.ts and reads the answer through map.ts, the only file that knows
 * WHMCS field names. The console works prices out itself and always sends
 * them (priceoverride, recurringamount), so WHMCS catalogue prices never
 * decide what a customer pays.
 *
 * Checked against developers.whmcs.com on 29 September 2026; see
 * docs/whmcs-api-notes.md for what each action does and doesn't document.
 */
export class WhmcsBillingAdapter implements BillingAdapter {
  readonly provider = "WHMCS" as const;

  private currencies?: Promise<{ id: string; code: string }[]>;
  private readonly clientCurrencies = new Map<string, string>();
  private readonly quantityOptions = new Map<string, map.QuantityOption | null>();
  private tlds?: { at: number; list: Promise<string[]> };

  private readonly now: () => Date;
  private readonly sendToRegistrar: boolean;

  /**
   * `sendToRegistrar` is on only in production: on the test install,
   * accepting a domain order never reaches a registrar.
   */
  constructor(
    readonly client: WhmcsClient,
    options: { now?: () => Date; sendToRegistrar?: boolean } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.sendToRegistrar = options.sendToRegistrar ?? false;
  }

  private read(action: string, params: map.Params = {}) {
    return this.client.call<Json>(action, params, { read: true });
  }

  private write(action: string, params: map.Params) {
    return this.client.call<Json>(action, params);
  }

  /** A read that answers null when WHMCS says the thing doesn't exist. */
  private async readOrNull(action: string, params: map.Params) {
    try {
      return await this.read(action, params);
    } catch (e) {
      if (e instanceof WhmcsRefusal && e.notFound) return null;
      throw e;
    }
  }

  /** Every row of a paged list action. */
  private async all(action: string, params: map.Params, rows: (r: Json) => Json[]) {
    const found: Json[] = [];
    for (let start = 0; ; start += PAGE) {
      const r = await this.read(action, { ...params, ...map.by.page(start, PAGE) });
      const page = rows(r);
      found.push(...page);
      const total = map.totalResults(r);
      if (page.length < PAGE || (total !== undefined && found.length >= total)) return found;
    }
  }

  // ─── Currencies ─────────────────────────────────────────────────────

  private currencyList() {
    this.currencies ??= this.read("GetCurrencies").then(map.fromCurrencies, (e) => {
      this.currencies = undefined;
      throw e;
    });
    return this.currencies;
  }

  private async currencyId(code: string) {
    const found = (await this.currencyList()).find((c) => c.code === code.toUpperCase());
    if (!found) throw new BillingError("invalid", `Currency ${code} is not set up in WHMCS.`);
    return found.id;
  }

  private async currencyCode(id: string) {
    const found = (await this.currencyList()).find((c) => c.id === id);
    if (!found) throw new BillingError("not-connected", `WHMCS currency ${id} is not one the console knows. Check the currencies in WHMCS.`);
    return found.code;
  }

  /** The client's currency code; every amount of theirs is in it. */
  private async currencyOf(clientId: string) {
    const known = this.clientCurrencies.get(clientId);
    if (known) return known;
    const client = await this.getClient(clientId);
    if (!client) throw new BillingError("not-found", `No client ${clientId}.`);
    return client.currency;
  }

  // ─── Clients ────────────────────────────────────────────────────────

  async getClient(clientId: string): Promise<BillingClient | null> {
    if (!/^\d+$/.test(clientId)) return null;
    const r = await this.readOrNull("GetClientsDetails", map.by.clientDetails(clientId));
    if (!r) return null;
    const c = map.clientRecord(r);
    const currency = map.clientCurrency(c);
    const code = currency.code ?? (await this.currencyCode(currency.id));
    this.clientCurrencies.set(clientId, code);
    return map.fromClient(c, code);
  }

  async createClient(input: NewBillingClient) {
    if (!input.email.includes("@")) throw new BillingError("invalid", "A client needs an email address.");
    // WHMCS 9 refuses AddClient without a password for the client's user.
    // Customers sign in to the console, never WHMCS, so it gets a random
    // one that is never stored or shown.
    const password = randomBytes(24).toString("base64url");
    const r = await this.write("AddClient", { ...map.toAddClient(input, await this.currencyId(input.currency)), password2: password });
    const clientId = map.newClientId(r);
    this.clientCurrencies.set(clientId, input.currency.toUpperCase());
    return { clientId };
  }

  async updateClient(clientId: string, patch: BillingClientPatch) {
    if (!(await this.getClient(clientId))) throw new BillingError("not-found", `No client ${clientId}.`);
    const currencyId = patch.currency ? await this.currencyId(patch.currency) : undefined;
    await this.write("UpdateClient", map.toUpdateClient(clientId, patch, currencyId));
    this.clientCurrencies.delete(clientId);
  }

  // ─── Catalogue ──────────────────────────────────────────────────────

  async listProducts(filter: { groupId?: string } = {}): Promise<BillingProduct[]> {
    const r = await this.read("GetProducts", filter.groupId ? map.by.group(filter.groupId) : {});
    return map.productsList(r).map((p) => {
      const product = map.fromProduct(p);
      this.quantityOptions.set(product.productId, map.quantityOption(p) ?? null);
      return product;
    });
  }

  /** The product's "Users" quantity option, if it is sold per user. */
  private async quantityOptionFor(productId: string) {
    if (!this.quantityOptions.has(productId)) {
      const [p] = map.productsList(await this.read("GetProducts", map.by.product(productId)));
      if (!p) throw new BillingError("not-found", `No product ${productId}.`);
      this.quantityOptions.set(productId, map.quantityOption(p) ?? null);
    }
    return this.quantityOptions.get(productId) ?? undefined;
  }

  // ─── Orders ─────────────────────────────────────────────────────────

  async placeOrder(clientId: string, order: NewOrder): Promise<PlacedOrder> {
    if (order.items.length === 0) throw new BillingError("invalid", "An order needs at least one item.");
    const currency = await this.currencyOf(clientId);
    const quantityOptions: Record<string, string> = {};
    for (const item of order.items) {
      if (item.recurringPrice.currency !== currency) throw new BillingError("invalid", `This client is billed in ${currency}.`);
      if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new BillingError("invalid", "Quantity must be at least 1.");
      if (item.recurringPrice.amountMinor < 0n) throw new BillingError("invalid", "A price can't be negative.");
      const option = await this.quantityOptionFor(item.productId);
      if (option) quantityOptions[item.productId] = option.optionId;
    }
    const oneOff = order.oneOffLines ?? [];
    if (oneOff.length && !order.createInvoice) throw new BillingError("invalid", "One-off charges need an invoice.");
    for (const line of oneOff) {
      if (line.amount.currency !== currency) throw new BillingError("invalid", `This client is billed in ${currency}.`);
      if (line.amount.amountMinor < 0n) throw new BillingError("invalid", "A price can't be negative.");
    }
    const placed = map.fromAddOrder(await this.write("AddOrder", map.toAddOrder(clientId, order, quantityOptions)));
    if (oneOff.length) {
      // AddOrder has no one-off charges of its own, so they join the order's
      // invoice, or get one when the order raised none (nothing monthly to pay).
      if (placed.invoiceId) await this.write("UpdateInvoice", map.toNewInvoiceItems(placed.invoiceId, oneOff));
      else placed.invoiceId = map.newInvoiceId(await this.write("CreateInvoice", map.toOneOffInvoice(clientId, oneOff, order.paymentMethod, this.now())));
    }
    return placed;
  }

  /** The order as WHMCS has it, with the services and domains it made. */
  private async findOrder(orderId: string) {
    if (!/^\d+$/.test(orderId)) throw new BillingError("not-found", `No order ${orderId}.`);
    const [o] = map.ordersList(await this.read("GetOrders", map.by.orderLookup(orderId)));
    if (!o) throw new BillingError("not-found", `No order ${orderId}.`);
    return { status: map.orderStatus(o), invoiceId: map.orderInvoiceId(o), ...map.orderItems(o) };
  }

  async acceptOrder(orderId: string) {
    const order = await this.findOrder(orderId);
    if (order.status !== "pending") throw new BillingError("conflict", `Order ${orderId} is ${order.status}, not pending.`);
    await this.write("AcceptOrder", map.toAcceptOrder(orderId, this.sendToRegistrar));
    // A product without a provisioning module stays pending after set-up;
    // accepting it is what makes it active in the console.
    for (const serviceId of order.serviceIds) {
      const service = await this.serviceById(serviceId);
      if (service?.service.status === "pending") await this.write("UpdateClientProduct", map.toServiceStatus(serviceId, "active"));
    }
  }

  async listOrders(clientId: string): Promise<BillingOrder[]> {
    const currency = await this.currencyOf(clientId);
    const rows = await this.all("GetOrders", map.by.clientOrders(clientId), map.ordersList);
    return rows.map((o) => map.fromOrder(o, currency));
  }

  /**
   * CancelOrder doesn't document what happens to the order's services and
   * invoice, so they are cancelled here explicitly as well.
   */
  async cancelOrder(orderId: string) {
    const order = await this.findOrder(orderId);
    if (order.status !== "pending") throw new BillingError("conflict", "Only a pending order can be cancelled.");
    await this.write("CancelOrder", map.toCancelOrder(orderId));
    for (const serviceId of order.serviceIds) {
      const service = await this.serviceById(serviceId);
      if (service && service.service.status !== "cancelled") await this.write("UpdateClientProduct", map.toServiceStatus(serviceId, "cancelled"));
    }
    if (order.invoiceId) {
      const invoice = await this.readOrNull("GetInvoice", map.by.invoice(order.invoiceId));
      if (invoice && map.invoiceStatus(invoice) === "unpaid") {
        await this.write("UpdateInvoice", map.toInvoiceStatus(order.invoiceId, "cancelled"));
      }
    }
  }

  // ─── Services ───────────────────────────────────────────────────────

  async listServices(clientId: string): Promise<Service[]> {
    if (!(await this.getClient(clientId))) return [];
    const currency = await this.currencyOf(clientId);
    const rows = await this.all("GetClientsProducts", map.by.client(clientId), map.clientsProducts);
    return rows.filter((p) => map.serviceClientId(p) === clientId).map((p) => map.fromService(p, currency));
  }

  async getService(clientId: string, serviceId: string): Promise<Service | null> {
    if (!/^\d+$/.test(clientId) || !/^\d+$/.test(serviceId)) return null;
    const r = await this.readOrNull("GetClientsProducts", map.by.clientService(clientId, serviceId));
    const p = r && map.clientsProducts(r).find((row) => map.serviceClientId(row) === clientId);
    if (!p) return null;
    return map.fromService(p, await this.currencyOf(clientId));
  }

  /** A service by id alone (staff and job use), with its client. */
  private async serviceById(serviceId: string) {
    if (!/^\d+$/.test(serviceId)) return null;
    const r = await this.readOrNull("GetClientsProducts", map.by.service(serviceId));
    const p = r && map.clientsProducts(r)[0];
    if (!p) return null;
    const clientId = map.serviceClientId(p);
    return { clientId, service: map.fromService(p, await this.currencyOf(clientId)) };
  }

  private async requireService(serviceId: string) {
    const found = await this.serviceById(serviceId);
    if (!found) throw new BillingError("not-found", `No service ${serviceId}.`);
    return found;
  }

  async runModuleAction(serviceId: string, action: ModuleAction, reason?: string) {
    const { service } = await this.requireService(serviceId);
    const rule = MODULE[action];
    if (!rule.from.includes(service.status)) throw new BillingError("conflict", `Can't ${action} a service that is ${service.status}.`);
    try {
      await this.write(rule.action, map.toModuleAction(serviceId, action === "suspend" ? reason : undefined));
    } catch (e) {
      if (!(e instanceof WhmcsRefusal) || e.code !== "invalid" || !NO_MODULE.test(e.whmcsMessage)) throw e;
      await this.write("UpdateClientProduct", map.toServiceStatus(serviceId, rule.to, action === "suspend" ? reason : undefined));
    }
  }

  /** What an upgrade needs: the service, its currency, and how the change is sent. */
  private async upgradeRequest(serviceId: string, change: ServiceChange) {
    const { service } = await this.requireService(serviceId);
    if (service.status !== "active") throw new BillingError("conflict", "Only an active service can be changed.");
    if (change.recurringPrice.currency !== service.recurring.currency) throw new BillingError("invalid", `This service is billed in ${service.recurring.currency}.`);
    if (change.quantity !== undefined && (!Number.isInteger(change.quantity) || change.quantity < 1)) throw new BillingError("invalid", "Quantity must be at least 1.");
    if (change.productId) await this.quantityOptionFor(change.productId);
    const option = change.productId ? undefined : await this.quantityOptionFor(service.productId);
    const quantity = change.quantity !== undefined && change.quantity !== service.quantity ? change.quantity : undefined;
    return { service, option, quantity };
  }

  async previewUpgrade(serviceId: string, change: ServiceChange): Promise<UpgradePreview> {
    return (await this.upgradePlan(serviceId, change)).preview;
  }

  /** The upgrade request plus what it costs now, which WHMCS works out without raising anything. */
  private async upgradePlan(serviceId: string, change: ServiceChange) {
    const request = await this.upgradeRequest(serviceId, change);
    const { service, option, quantity } = request;
    const period = periodOf(service, this.now());
    const base = { currentRecurring: service.recurring, newRecurring: change.recurringPrice };
    // Without a product change or a "Users" option, WHMCS has nothing to
    // work out: the new price starts with the next period.
    if (!change.productId && !(option && quantity)) return { ...request, preview: { ...base, dueNow: money(0n, service.recurring.currency), ...period } };
    const r = await this.write(
      "UpgradeProduct",
      map.toUpgrade(serviceId, { quantityOptionId: option?.optionId, quantity, productId: change.productId, billingCycle: service.billingCycle }, PAYMENT_METHODS.eft, true),
    );
    const days = map.fromUpgradeDays(r);
    const preview: UpgradePreview = {
      ...base,
      dueNow: map.fromUpgradePrice(r, service.recurring.currency),
      daysLeft: days.daysLeft ?? period.daysLeft,
      daysInPeriod: days.daysInPeriod ?? period.daysInPeriod,
    };
    return { ...request, preview };
  }

  /**
   * Sets the new product or users and our recurring price at once, as the
   * console provisions the change straight away, and bills the part-month
   * WHMCS worked out on an ordinary invoice. WHMCS's own upgrade order is
   * not used: once its invoice is paid, WHMCS adds the upgrade to the
   * recurring amount (checked on the live install), overwriting our price.
   */
  async upgradeService(serviceId: string, change: ServiceChange, paymentMethod: string) {
    const { service, option, quantity, preview } = await this.upgradePlan(serviceId, change);
    const { clientId } = await this.requireService(serviceId);
    if (change.productId) await this.write("UpdateClientProduct", map.toServiceProduct(serviceId, change.productId, service.billingCycle));
    if (option && quantity) await this.write("UpdateClientProduct", map.toServiceQuantity(serviceId, option, quantity));
    await this.write("UpdateClientProduct", map.toRecurring(serviceId, change.recurringPrice));
    let invoiceId: string | undefined;
    if (preview.dueNow.amountMinor > 0n) {
      const taxed = await this.serviceIsTaxed(clientId, serviceId);
      const what = quantity ? `${service.name}, ${service.quantity} to ${quantity} users` : `${service.name}, changed plan`;
      const description = `${what}, ${preview.daysLeft} of ${preview.daysInPeriod} days to ${map.dateOnly(service.nextDueOn)}`;
      invoiceId = map.newInvoiceId(await this.write("CreateInvoice", map.toPartMonthInvoice(clientId, { description, amount: preview.dueNow, taxed, paymentMethod, today: this.now() })));
    }
    // There is no WHMCS order; the service id stands in for one.
    return { orderId: `service-${serviceId}`, invoiceId };
  }

  /** Whether the service's own invoice lines are taxed, from its most recent invoices; taxed if none is found. */
  private async serviceIsTaxed(clientId: string, serviceId: string) {
    for (const summary of (await this.listInvoices(clientId)).slice(0, 5)) {
      const line = (await this.getInvoice(clientId, summary.invoiceId))?.lines.find((l) => l.relatedId === serviceId && l.kind === "service");
      if (line) return line.taxed;
    }
    return true;
  }

  // ─── Invoices and payments ──────────────────────────────────────────

  async listInvoices(clientId: string, filter: InvoiceFilter = {}): Promise<InvoiceSummary[]> {
    if (!(await this.getClient(clientId))) return [];
    const currency = await this.currencyOf(clientId);
    const rows: Json[] = [];
    for (let start = 0; ; start += PAGE) {
      const r = await this.read("GetInvoices", map.toGetInvoices(clientId, filter.status, start, PAGE));
      const page = map.invoicesList(r);
      rows.push(...page);
      const total = map.totalResults(r);
      if (page.length < PAGE || (total !== undefined && rows.length >= total)) break;
    }
    return rows
      .map((i) => map.fromInvoiceSummary({ currencycode: currency, ...i }))
      .filter((i) => (!filter.from || i.issuedOn >= filter.from) && (!filter.to || i.issuedOn <= filter.to));
  }

  /** GetInvoice with its client, or null when it doesn't exist. */
  private async invoiceById(invoiceId: string) {
    if (!/^\d+$/.test(invoiceId)) return null;
    const r = await this.readOrNull("GetInvoice", map.by.invoice(invoiceId));
    if (!r) return null;
    const clientId = map.invoiceClientId(r);
    return { clientId, raw: r, invoice: map.fromInvoice(r, await this.currencyOf(clientId)) };
  }

  async getInvoice(clientId: string, invoiceId: string): Promise<Invoice | null> {
    const found = await this.invoiceById(invoiceId);
    return found && found.clientId === clientId ? found.invoice : null;
  }

  async setPurchaseOrder(invoiceId: string, poNumber: string | null) {
    const found = await this.invoiceById(invoiceId);
    if (!found) throw new BillingError("not-found", `No invoice ${invoiceId}.`);
    await this.write("UpdateInvoice", map.toInvoiceNotes(invoiceId, withPoNote(found.invoice.notes ?? null, poNumber)));
  }

  async recordPayment(invoiceId: string, payment: RecordedPayment) {
    const found = await this.invoiceById(invoiceId);
    if (!found) throw new BillingError("not-found", `No invoice ${invoiceId}.`);
    const { invoice } = found;
    if (invoice.status !== "unpaid" && invoice.status !== "payment_pending") throw new BillingError("conflict", `Invoice ${invoice.number} is ${invoice.status}.`);
    if (payment.amount.currency !== invoice.total.currency) throw new BillingError("invalid", `Invoice ${invoice.number} is in ${invoice.total.currency}.`);
    if (payment.amount.amountMinor <= 0n) throw new BillingError("invalid", "A payment must be more than zero.");
    if (!payment.reference.trim()) throw new BillingError("invalid", "A payment needs a reference.");
    await this.write("AddInvoicePayment", map.toAddInvoicePayment(invoiceId, payment));
  }

  async listTransactions(clientId: string, filter: DateFilter = {}): Promise<Transaction[]> {
    if (!(await this.getClient(clientId))) return [];
    const currency = await this.currencyOf(clientId);
    const r = await this.read("GetTransactions", map.by.client(clientId));
    return map
      .transactionsList(r)
      .filter((t) => map.transactionClientId(t) === clientId)
      .map((t) => map.fromTransaction(t, currency))
      .filter((t) => (!filter.from || t.date >= filter.from) && (!filter.to || t.date <= filter.to));
  }

  async listPayMethods(clientId: string): Promise<PayMethod[]> {
    if (!(await this.getClient(clientId))) return [];
    const rows = map.payMethods(await this.read("GetPayMethods", map.by.client(clientId)));
    // WHMCS marks no default here; the first is the one it charges.
    const first = rows[0] ? map.fromPayMethod(rows[0]).payMethodId : undefined;
    return rows.map((p) => map.fromPayMethod(p, first));
  }

  /**
   * WHMCS's AddPayMethod only saves a card with its full number, which the
   * console never sees. Saved cards stay with the gateway (DPO) instead.
   */
  async addPayMethod(clientId: string, method: NewPayMethod): Promise<{ payMethodId: string }> {
    void clientId;
    void method;
    throw new BillingError("invalid", "WHMCS can only save a card with its full number, so cards are saved with the payment gateway instead.");
  }

  // ─── Domains ────────────────────────────────────────────────────────

  async listDomains(clientId: string): Promise<Domain[]> {
    if (!(await this.getClient(clientId))) return [];
    const currency = await this.currencyOf(clientId);
    const rows = await this.all("GetClientsDomains", map.by.client(clientId), map.domainsList);
    return rows.map((d) => map.fromDomain(d, currency));
  }

  /** The endings we sell: every TLD with WHMCS pricing. */
  private tldList() {
    if (!this.tlds || this.now().getTime() - this.tlds.at > TLD_CACHE_MS) {
      const list = this.currencyList().then(async ([first]) => {
        if (!first) throw new BillingError("not-connected", "WHMCS has no currencies set up.");
        return map.fromTldPricing(await this.read("GetTLDPricing", map.by.currency(first.id)), first.code).map((t) => t.tld);
      });
      list.catch(() => (this.tlds = undefined));
      this.tlds = { at: this.now().getTime(), list };
    }
    return this.tlds.list;
  }

  /** A domain name already held by any client in WHMCS. */
  private async heldInWhmcs(name: string) {
    const rows = map.domainsList(await this.read("GetClientsDomains", map.by.domainName(name)));
    return rows.some((d) => map.fromDomainName(d) === name && !RELEASED.includes(map.fromDomainStatus(d)));
  }

  async checkDomain(rawName: string): Promise<DomainAvailability> {
    const name = rawName.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(name)) throw new BillingError("invalid", "Enter a domain like yourname.co.bw.");
    const tld = (await this.tldList()).filter((t) => name.endsWith(t)).sort((a, b) => b.length - a.length)[0];
    if (!tld) return { name, supported: false, available: false };
    if (name.slice(0, -tld.length).includes(".")) throw new BillingError("invalid", "Enter the name without a subdomain, like yourname.co.bw.");
    if (await this.heldInWhmcs(name)) return { name, supported: true, available: false };
    return { name, supported: true, available: map.whoisAvailable(await this.read("DomainWhois", map.by.domainName(name))) };
  }

  private async domainOrder(clientId: string, request: DomainRequest & { authCode?: string }, kind: "register" | "transfer"): Promise<PlacedOrder> {
    if (!Number.isInteger(request.years) || request.years < 1 || request.years > 10) throw new BillingError("invalid", "Choose between 1 and 10 years.");
    const check = await this.checkDomain(request.name);
    if (!check.supported) throw new BillingError("invalid", `We don't sell ${request.name} yet.`);
    if (kind === "register" && !check.available) throw new BillingError("conflict", `${check.name} is already taken.`);
    if (kind === "transfer") {
      if (await this.heldInWhmcs(check.name)) throw new BillingError("conflict", `${check.name} is already with us.`);
      if (check.available) throw new BillingError("invalid", `${check.name} isn't registered yet, so it can be registered instead.`);
    }
    const currency = await this.currencyOf(clientId);
    if (request.price.currency !== currency) throw new BillingError("invalid", `This client is billed in ${currency}.`);
    return map.fromAddOrder(await this.write("AddOrder", map.toDomainOrder(clientId, { ...request, name: check.name }, kind)));
  }

  registerDomain(clientId: string, request: DomainRequest) {
    return this.domainOrder(clientId, request, "register");
  }

  async transferDomain(clientId: string, request: DomainTransferRequest) {
    if (!request.authCode.trim()) throw new BillingError("invalid", "The transfer needs the code from your current registrar.");
    return this.domainOrder(clientId, { ...request, authCode: request.authCode.trim() }, "transfer");
  }

  async renewDomain(clientId: string, domainId: string, years: number, paymentMethod: string) {
    if (!Number.isInteger(years) || years < 1 || years > 10) throw new BillingError("invalid", "Choose between 1 and 10 years.");
    if (!/^\d+$/.test(domainId)) throw new BillingError("not-found", `No domain ${domainId}.`);
    const r = await this.readOrNull("GetClientsDomains", map.by.clientDomain(clientId, domainId));
    const row = r && map.domainsList(r).find((d) => map.fromDomainId(d) === domainId);
    if (!row) throw new BillingError("not-found", `No domain ${domainId}.`);
    const domain = map.fromDomain(row, await this.currencyOf(clientId));
    if (domain.status !== "active" && domain.status !== "expired") throw new BillingError("conflict", `${domain.name} can't be renewed while it is ${domain.status}.`);
    const placed = map.fromAddOrder(await this.write("AddOrder", map.toDomainRenewal(clientId, domainId, years, paymentMethod)));
    return { orderId: placed.orderId, invoiceId: placed.invoiceId };
  }

  async getTldPricing(currency: string): Promise<TldPrice[]> {
    const id = await this.currencyId(currency);
    return map.fromTldPricing(await this.read("GetTLDPricing", map.by.currency(id)), currency.toUpperCase());
  }
}

/** The days left in a service's current period, worked out from its due date. */
function periodOf(service: Service, now: Date) {
  const day = 86_400_000;
  const next = service.nextDueOn.getTime();
  const start = new Date(service.nextDueOn);
  if (service.billingCycle === "annually") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else start.setUTCMonth(start.getUTCMonth() - 1);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysInPeriod = Math.round((next - start.getTime()) / day);
  return { daysInPeriod, daysLeft: Math.min(daysInPeriod, Math.max(0, Math.round((next - today) / day))) };
}
