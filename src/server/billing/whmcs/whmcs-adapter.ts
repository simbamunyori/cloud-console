import type { BillingAdapter } from "../adapter";
import { BillingError } from "../adapter";
import type { WhmcsClient } from "./client";

/**
 * The WHMCS side of the billing adapter, an empty shell until WHMCS is
 * bought in Phase 2. The transport (client.ts) and every field mapping
 * (map.ts, with tests) are ready; filling in a method means calling the
 * action named beside it and passing the response through map.ts. The
 * contract tests in tests/billing-contract.ts must then pass against a
 * WHMCS staging copy. See docs/whmcs-mapping.md.
 */
export class WhmcsBillingAdapter implements BillingAdapter {
  readonly provider = "WHMCS" as const;

  constructor(readonly client: WhmcsClient) {}

  private notYet(action: string): never {
    throw new BillingError("not-connected", `The WHMCS connection is not built yet (${action}). Set BILLING_ADAPTER=stub.`);
  }

  getClient = async (): Promise<never> => this.notYet("GetClientsDetails");
  createClient = async (): Promise<never> => this.notYet("AddClient");
  updateClient = async (): Promise<never> => this.notYet("UpdateClient");
  listProducts = async (): Promise<never> => this.notYet("GetProducts");
  placeOrder = async (): Promise<never> => this.notYet("AddOrder");
  acceptOrder = async (): Promise<never> => this.notYet("AcceptOrder");
  listOrders = async (): Promise<never> => this.notYet("GetOrders");
  cancelOrder = async (): Promise<never> => this.notYet("CancelOrder");
  listServices = async (): Promise<never> => this.notYet("GetClientsProducts");
  getService = async (): Promise<never> => this.notYet("GetClientsProducts");
  runModuleAction = async (): Promise<never> => this.notYet("ModuleCreate / ModuleSuspend / ModuleUnsuspend / ModuleTerminate");
  previewUpgrade = async (): Promise<never> => this.notYet("UpgradeProduct with calconly");
  upgradeService = async (): Promise<never> => this.notYet("UpgradeProduct, then UpdateClientProduct recurringamount");
  listInvoices = async (): Promise<never> => this.notYet("GetInvoices");
  getInvoice = async (): Promise<never> => this.notYet("GetInvoice");
  setPurchaseOrder = async (): Promise<never> => this.notYet("GetInvoice, then UpdateInvoice notes");
  recordPayment = async (): Promise<never> => this.notYet("AddInvoicePayment");
  listTransactions = async (): Promise<never> => this.notYet("GetTransactions");
  listPayMethods = async (): Promise<never> => this.notYet("GetPayMethods");
  addPayMethod = async (): Promise<never> => this.notYet("AddPayMethod (RemoteCreditCard)");
  listDomains = async (): Promise<never> => this.notYet("GetClientsDomains");
  checkDomain = async (): Promise<never> => this.notYet("DomainWhois");
  registerDomain = async (): Promise<never> => this.notYet("AddOrder with domaintype register");
  transferDomain = async (): Promise<never> => this.notYet("AddOrder with domaintype transfer");
  renewDomain = async (): Promise<never> => this.notYet("AddOrder with domainrenewals");
  getTldPricing = async (): Promise<never> => this.notYet("GetTLDPricing");
}
