import type { Money } from "@/lib/domain/money";

/**
 * The billing and provisioning engine behind the console. WHMCS will fill
 * this role from Phase 2; until then StubBillingAdapter does, with state in
 * PostgreSQL. Each method names the WHMCS API action it maps to; the field
 * mapping lives only in whmcs/map.ts (see docs/whmcs-mapping.md).
 *
 * Everything here is our own domain model. Ids are strings because WHMCS
 * ids are numbers that the console never does arithmetic on. Dates without
 * a time (due dates, renewal dates) are midnight UTC, as in src/lib/dates.ts.
 * "Today" is the engine's own date, as it is in WHMCS.
 *
 * Customer pages never hold this interface directly: they use billingFor()
 * in scoped.ts, which is already bound to their own organisation's client.
 */

export type BillingCycle = "monthly" | "quarterly" | "semiannually" | "annually";

/** Months in each billing period. New orders are monthly; the longer ones come with migrated customers. */
export const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, semiannually: 6, annually: 12 };

export type ClientStatus = "active" | "inactive" | "closed";

export interface BillingClient {
  clientId: string;
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** ISO 4217. Every invoice for the client is in this currency. */
  currency: string;
  address1?: string;
  city?: string;
  phone?: string;
  taxId?: string;
  status: ClientStatus;
}

export type NewBillingClient = Omit<BillingClient, "clientId" | "status">;
/** The currency can only change while the client has no invoices; the console checks first. */
export type BillingClientPatch = Partial<Omit<BillingClient, "clientId">>;

export interface BillingProductPrice {
  monthly?: Money;
  annually?: Money;
  setup?: Money;
}

export interface BillingProduct {
  productId: string;
  groupId: string;
  groupName: string;
  name: string;
  /** "hostingaccount", "server", "other" and so on, as in WHMCS. */
  type: string;
  /** Keyed by currency code. A cycle that is missing is not offered. */
  prices: Record<string, BillingProductPrice>;
  hidden: boolean;
}

export interface NewOrderItem {
  productId: string;
  quantity: number;
  billingCycle: BillingCycle;
  /**
   * The recurring price for the whole item per cycle (unit price times
   * quantity). The console works prices out itself, so this is always
   * sent (WHMCS priceoverride).
   */
  recurringPrice: Money;
  domain?: string;
  /** Choices such as the operating system, by option name. */
  options?: Record<string, string>;
}

export interface NewOrder {
  items: NewOrderItem[];
  /** Payment method system name, e.g. "banktransfer". */
  paymentMethod: string;
  /** False when the change joins the next monthly invoice instead. */
  createInvoice: boolean;
  /**
   * Charges made once, such as installation, added to the order's invoice
   * (createInvoice must be true). Each amount is the whole line.
   */
  oneOffLines?: OneOffLine[];
}

export interface OneOffLine {
  description: string;
  amount: Money;
}

/** An invoice for charges outside any order, such as a month's Azure usage. */
export interface NewInvoice {
  lines: { description: string; amount: Money; taxed: boolean }[];
  /** Payment method system name, e.g. "banktransfer". */
  paymentMethod: string;
  dueOn: Date;
  /** The invoice date; today when not given. An opening balance keeps the original date. */
  issuedOn?: Date;
}

/**
 * A service brought over from the billing system we used before, already
 * running and paid for up to nextDueOn. It is made active with no invoice,
 * no set-up and no email, at the customer's own price.
 */
export interface ImportedService {
  productId: string;
  quantity: number;
  billingCycle: BillingCycle;
  /** The whole service per cycle. */
  recurringPrice: Money;
  registeredOn: Date;
  /** The first day our billing charges for. */
  nextDueOn: Date;
  domain?: string;
  /** Kept with the service for staff, e.g. where it came from. */
  note?: string;
}

/** A domain we already look after, brought over with its own dates and renewal price. Nothing goes to the registrar. */
export interface ImportedDomain {
  name: string;
  registrar: string;
  registeredOn: Date;
  expiresOn: Date;
  nextDueOn: Date;
  /** Renewal price for one registration period. */
  renewal: Money;
  registrationYears: number;
  autoRenew: boolean;
}

/**
 * How an order is accepted. A domain in the order goes to the registrar
 * module named (WHMCS's Openprovider module) when the billing engine sends
 * orders to registrars at all, which is only in production.
 */
export interface AcceptOptions {
  registrar?: string;
  /** False when the console has already registered the domain itself (the .bw registry). */
  sendToRegistrar?: boolean;
}

export interface DomainPatch {
  status?: "active";
  expiresOn?: Date;
  nextDueOn?: Date;
}

export interface PlacedOrder {
  orderId: string;
  invoiceId?: string;
  serviceIds: string[];
  domainIds: string[];
}

export type OrderStatus = "pending" | "active" | "cancelled" | "fraud";

export interface BillingOrder {
  orderId: string;
  placedAt: Date;
  status: OrderStatus;
  invoiceId?: string;
  total: Money;
}

export type ServiceStatus = "pending" | "active" | "suspended" | "terminated" | "cancelled";

/** What a provisioning module reports about a service. Every part is optional. */
export interface ServiceDetails {
  users?: { name: string; email: string }[];
  resources?: { label: string; value: string }[];
  usage?: { label: string; used: number; limit: number | null; unit: string }[];
}

export interface Service {
  serviceId: string;
  productId: string;
  orderId?: string;
  name: string;
  groupName: string;
  domain?: string;
  status: ServiceStatus;
  quantity: number;
  /** What the customer pays per cycle, for the whole quantity. */
  recurring: Money;
  billingCycle: BillingCycle;
  registeredOn: Date;
  nextDueOn: Date;
  suspendReason?: string;
  details: ServiceDetails;
}

export type ModuleAction = "create" | "suspend" | "unsuspend" | "terminate";

export interface ServiceChange {
  quantity?: number;
  productId?: string;
  /** New recurring price per cycle for the whole service. */
  recurringPrice: Money;
}

export interface UpgradePreview {
  currentRecurring: Money;
  newRecurring: Money;
  /** Charged now for the rest of this period; negative is a credit. */
  dueNow: Money;
  daysLeft: number;
  daysInPeriod: number;
}

export type InvoiceStatus = "draft" | "unpaid" | "paid" | "cancelled" | "refunded" | "collections" | "payment_pending";

export interface InvoiceSummary {
  invoiceId: string;
  /** What the customer quotes, e.g. "INV-2026-0142". */
  number: string;
  issuedOn: Date;
  dueOn: Date;
  paidOn?: Date;
  status: InvoiceStatus;
  total: Money;
}

export type InvoiceLineKind = "service" | "domain" | "setup" | "prorata" | "upgrade" | "item";

export interface InvoiceLine {
  lineId: string;
  kind: InvoiceLineKind;
  /** The service or domain the line is for. */
  relatedId?: string;
  description: string;
  amount: Money;
  taxed: boolean;
}

export interface Invoice extends InvoiceSummary {
  subtotal: Money;
  tax: Money;
  /** Basis points, 1,400 is 14%. */
  taxRateBps: number;
  /** What is still owed after payments. */
  balance: Money;
  lines: InvoiceLine[];
  payments: Transaction[];
  notes?: string;
}

export interface Transaction {
  transactionId: string;
  date: Date;
  invoiceId?: string;
  /** Payment method system name, e.g. "banktransfer" or "stubcard". */
  gateway: string;
  /** The gateway's or bank's reference. */
  reference: string;
  amountIn: Money;
  amountOut: Money;
  description: string;
}

export interface RecordedPayment {
  amount: Money;
  gateway: string;
  reference: string;
  paidAt: Date;
}

export interface PayMethod {
  payMethodId: string;
  kind: "card" | "bank_account";
  description: string;
  cardBrand?: string;
  lastFour?: string;
  /** "MM/YY". */
  expiry?: string;
  isDefault: boolean;
}

/**
 * A card saved at the gateway. The console never sees card numbers; the
 * gateway gives back a token (WHMCS type RemoteCreditCard).
 */
export interface NewPayMethod {
  gatewayToken: string;
  gateway: string;
  cardBrand: string;
  lastFour: string;
  expiry: string;
  setDefault: boolean;
}

export type DomainStatus = "pending" | "pending_transfer" | "active" | "expired" | "cancelled" | "transferred_away";

export interface Domain {
  domainId: string;
  name: string;
  registrar: string;
  status: DomainStatus;
  registeredOn: Date;
  expiresOn: Date;
  nextDueOn: Date;
  /** Renewal price for one registration period. */
  renewal: Money;
  registrationYears: number;
  autoRenew: boolean;
}

export interface DomainAvailability {
  name: string;
  /** False when we don't sell the ending (e.g. ".xyz"). */
  supported: boolean;
  available: boolean;
}

export interface DomainRequest {
  name: string;
  years: number;
  price: Money;
  paymentMethod: string;
}

export interface DomainTransferRequest extends DomainRequest {
  /** The code from the current registrar. Passed through, never stored. */
  authCode: string;
}

export interface TldPrice {
  /** With the dot, e.g. ".co.bw". */
  tld: string;
  register: Money;
  renew: Money;
  transfer: Money;
}

export interface InvoiceFilter {
  status?: InvoiceStatus;
  from?: Date;
  to?: Date;
}

export interface DateFilter {
  from?: Date;
  to?: Date;
}

export class BillingError extends Error {
  constructor(
    public readonly code: "not-found" | "invalid" | "conflict" | "not-connected",
    message: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export interface BillingAdapter {
  readonly provider: "STUB" | "WHMCS";

  // Clients: GetClientsDetails, AddClient, UpdateClient
  getClient(clientId: string): Promise<BillingClient | null>;
  createClient(input: NewBillingClient): Promise<{ clientId: string }>;
  updateClient(clientId: string, patch: BillingClientPatch): Promise<void>;

  // Catalogue: GetProducts
  listProducts(filter?: { groupId?: string }): Promise<BillingProduct[]>;

  // Orders: AddOrder, AcceptOrder, GetOrders, CancelOrder
  placeOrder(clientId: string, order: NewOrder): Promise<PlacedOrder>;
  acceptOrder(orderId: string, options?: AcceptOptions): Promise<void>;
  listOrders(clientId: string): Promise<BillingOrder[]>;
  /** Only while the order is pending, as in WHMCS. */
  cancelOrder(orderId: string): Promise<void>;

  // Services: GetClientsProducts, ModuleCreate, ModuleSuspend, ModuleUnsuspend,
  // ModuleTerminate, UpgradeProduct (calconly for the preview)
  listServices(clientId: string): Promise<Service[]>;
  getService(clientId: string, serviceId: string): Promise<Service | null>;
  runModuleAction(serviceId: string, action: ModuleAction, reason?: string): Promise<void>;
  previewUpgrade(serviceId: string, change: ServiceChange): Promise<UpgradePreview>;
  upgradeService(serviceId: string, change: ServiceChange, paymentMethod: string): Promise<{ orderId: string; invoiceId?: string }>;

  // Migration: AddOrder (no invoice), AcceptOrder (no set-up), then
  // UpdateClientProduct or UpdateClientDomain for the dates and price.
  importService(clientId: string, service: ImportedService): Promise<{ serviceId: string }>;
  importDomain(clientId: string, domain: ImportedDomain): Promise<{ domainId: string }>;

  // Invoices and payments: GetInvoices, GetInvoice, UpdateInvoice (notes),
  // AddInvoicePayment, GetTransactions, GetPayMethods, AddPayMethod
  listInvoices(clientId: string, filter?: InvoiceFilter): Promise<InvoiceSummary[]>;
  /** CreateInvoice, unpaid and not emailed: the console tells the customer. */
  createInvoice(clientId: string, invoice: NewInvoice): Promise<{ invoiceId: string }>;
  getInvoice(clientId: string, invoiceId: string): Promise<Invoice | null>;
  /** WHMCS has no PO field; this writes "PO: X" into the invoice notes. */
  setPurchaseOrder(invoiceId: string, poNumber: string | null): Promise<void>;
  recordPayment(invoiceId: string, payment: RecordedPayment): Promise<void>;
  listTransactions(clientId: string, filter?: DateFilter): Promise<Transaction[]>;
  listPayMethods(clientId: string): Promise<PayMethod[]>;
  addPayMethod(clientId: string, method: NewPayMethod): Promise<{ payMethodId: string }>;

  // Domains: GetClientsDomains, DomainWhois, AddOrder (register, transfer and
  // renewals), GetTLDPricing
  listDomains(clientId: string): Promise<Domain[]>;
  checkDomain(name: string): Promise<DomainAvailability>;
  registerDomain(clientId: string, request: DomainRequest): Promise<PlacedOrder>;
  transferDomain(clientId: string, request: DomainTransferRequest): Promise<PlacedOrder>;
  renewDomain(clientId: string, domainId: string, years: number, paymentMethod: string): Promise<{ orderId: string; invoiceId?: string }>;
  getTldPricing(currency: string): Promise<TldPrice[]>;
  /** UpdateClientDomain: the registry's own dates once the console has registered or renewed a domain itself. */
  updateDomain(domainId: string, patch: DomainPatch): Promise<void>;
}

/** A new invoice's lines: at least one, in the client's currency, none negative. */
export function checkInvoiceLines(invoice: NewInvoice, currency: string) {
  if (!invoice.lines.length) throw new BillingError("invalid", "An invoice needs at least one line.");
  for (const l of invoice.lines) {
    if (l.amount.currency !== currency) throw new BillingError("invalid", `This client is billed in ${currency}.`);
    if (l.amount.amountMinor < 0n) throw new BillingError("invalid", "A charge can't be negative.");
  }
}

/** An imported service or domain: a price that isn't negative, in the client's currency, and sane dates. */
export function checkImported(item: { recurringPrice?: Money; renewal?: Money; registeredOn: Date; nextDueOn: Date; quantity?: number }, currency: string) {
  const price = item.recurringPrice ?? item.renewal!;
  if (price.currency !== currency) throw new BillingError("invalid", `This client is billed in ${currency}.`);
  if (price.amountMinor < 0n) throw new BillingError("invalid", "A price can't be negative.");
  if (item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 1)) throw new BillingError("invalid", "Quantity must be at least 1.");
  if (item.nextDueOn < item.registeredOn) throw new BillingError("invalid", "The next due date is before the start date.");
}

/** The payment method system names the console uses. */
export const PAYMENT_METHODS = { eft: "banktransfer", card: "stubcard" } as const;
