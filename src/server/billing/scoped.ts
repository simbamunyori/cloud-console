import type { PrismaClient } from "@prisma/client";
import {
  type BillingAdapter,
  type BillingClientPatch,
  BillingError,
  type DateFilter,
  type DomainRequest,
  type DomainTransferRequest,
  type InvoiceFilter,
  type NewOrder,
  type NewPayMethod,
  type RecordedPayment,
  type ServiceChange,
} from "./adapter";
import { ensureBillingAccount } from "./accounts";

/**
 * The billing adapter bound to one organisation's billing client. Customer
 * code only ever gets one of these, so it has no way to name another
 * client: every method either passes this client's id or first checks that
 * the service, invoice or order belongs to it. Module actions (suspend,
 * terminate) are not here at all; they are staff-only.
 */
export class ScopedBilling {
  constructor(
    private readonly adapter: BillingAdapter,
    readonly clientId: string,
  ) {}

  client() {
    return this.adapter.getClient(this.clientId);
  }
  updateClient(patch: BillingClientPatch) {
    return this.adapter.updateClient(this.clientId, patch);
  }

  listProducts() {
    return this.adapter.listProducts();
  }

  placeOrder(order: NewOrder) {
    return this.adapter.placeOrder(this.clientId, order);
  }
  listOrders() {
    return this.adapter.listOrders(this.clientId);
  }
  async cancelOrder(orderId: string) {
    const orders = await this.adapter.listOrders(this.clientId);
    if (!orders.some((o) => o.orderId === orderId)) throw new BillingError("not-found", "That order isn't on your account.");
    return this.adapter.cancelOrder(orderId);
  }

  listServices() {
    return this.adapter.listServices(this.clientId);
  }
  getService(serviceId: string) {
    return this.adapter.getService(this.clientId, serviceId);
  }
  private async ownService(serviceId: string) {
    if (!(await this.adapter.getService(this.clientId, serviceId))) throw new BillingError("not-found", "That service isn't on your account.");
  }
  async previewUpgrade(serviceId: string, change: ServiceChange) {
    await this.ownService(serviceId);
    return this.adapter.previewUpgrade(serviceId, change);
  }
  async upgradeService(serviceId: string, change: ServiceChange, paymentMethod: string) {
    await this.ownService(serviceId);
    return this.adapter.upgradeService(serviceId, change, paymentMethod);
  }

  listInvoices(filter?: InvoiceFilter) {
    return this.adapter.listInvoices(this.clientId, filter);
  }
  getInvoice(invoiceId: string) {
    return this.adapter.getInvoice(this.clientId, invoiceId);
  }
  private async ownInvoice(invoiceId: string) {
    const invoice = await this.adapter.getInvoice(this.clientId, invoiceId);
    if (!invoice) throw new BillingError("not-found", "That invoice isn't on your account.");
    return invoice;
  }
  async setPurchaseOrder(invoiceId: string, poNumber: string | null) {
    await this.ownInvoice(invoiceId);
    return this.adapter.setPurchaseOrder(invoiceId, poNumber);
  }
  async recordPayment(invoiceId: string, payment: RecordedPayment) {
    await this.ownInvoice(invoiceId);
    return this.adapter.recordPayment(invoiceId, payment);
  }
  listTransactions(filter?: DateFilter) {
    return this.adapter.listTransactions(this.clientId, filter);
  }
  listPayMethods() {
    return this.adapter.listPayMethods(this.clientId);
  }
  addPayMethod(method: NewPayMethod) {
    return this.adapter.addPayMethod(this.clientId, method);
  }

  listDomains() {
    return this.adapter.listDomains(this.clientId);
  }
  checkDomain(name: string) {
    return this.adapter.checkDomain(name);
  }
  getTldPricing(currency: string) {
    return this.adapter.getTldPricing(currency);
  }
  registerDomain(request: DomainRequest) {
    return this.adapter.registerDomain(this.clientId, request);
  }
  transferDomain(request: DomainTransferRequest) {
    return this.adapter.transferDomain(this.clientId, request);
  }
  renewDomain(domainId: string, years: number, paymentMethod: string) {
    return this.adapter.renewDomain(this.clientId, domainId, years, paymentMethod);
  }
}

/** Binds the adapter to an organisation, creating its billing client on first use. */
export async function scopedBilling(db: PrismaClient, adapter: BillingAdapter, organisationId: string) {
  const account = await ensureBillingAccount(db, adapter, organisationId);
  return new ScopedBilling(adapter, account.externalClientId);
}
