# Billing adapter and WHMCS mapping

Every billing and provisioning call in the console goes through
`BillingAdapter` (`src/server/billing/adapter.ts`). Two implementations
exist:

- `StubBillingAdapter` (`stub/stub-adapter.ts`), used now. It keeps its
  state in the `Stub*` tables, so ordering, paying and cancelling work end
  to end.
- `WhmcsBillingAdapter` (`whmcs/whmcs-adapter.ts`), a shell for Phase 2.
  Its transport (`whmcs/client.ts`) and all field mapping (`whmcs/map.ts`,
  with tests) are written; each method names the WHMCS action it will call.

`BILLING_ADAPTER` chooses one (`stub` or `whmcs`). WHMCS field names appear
only in `whmcs/map.ts`. The API was checked against developers.whmcs.com on
27 September 2026; the findings are in `docs/whmcs-api-notes.md`.

## Tenant safety

One console organisation is one billing client. `BillingAccount` stores
the link (`organisationId` to `externalClientId`, unique both ways). It is
made at sign-up, or the first time billing is used if the engine was down.

Customer code never holds the adapter. It calls `billingFor(organisationId)`,
which returns a `ScopedBilling` bound to that organisation's client. Every
method either passes that client id or first checks that the service,
invoice or order belongs to it. Module actions (suspend, terminate) are not
on `ScopedBilling` at all; staff code uses `billingAdapter()` and writes an
audit event for each action.

## Method to action

| Adapter method | WHMCS action | Notes |
| --- | --- | --- |
| `getClient` | GetClientsDetails | The client has a currency id; the code comes from GetCurrencies |
| `createClient` | AddClient | WHMCS needs state and postcode; Botswana has neither, so placeholders are sent. `noemail` is set: the console sends its own emails |
| `updateClient` | UpdateClient | |
| `listProducts` | GetProducts | `-1.00` marks a cycle that is switched off |
| `placeOrder` | AddOrder | Prices are always sent as `priceoverride[]` (see Prices below). `configoptions[]` is base64 of a PHP-serialised array. `noinvoice` when the change joins the next monthly invoice |
| `acceptOrder` | AcceptOrder | Staff run this when a manual set-up task is done |
| `listOrders` | GetOrders | |
| `cancelOrder` | CancelOrder | Pending orders only, in WHMCS and the stub alike |
| `listServices`, `getService` | GetClientsProducts | The response includes the service password; `map.ts` drops it and responses are never logged |
| `runModuleAction` | ModuleCreate, ModuleSuspend, ModuleUnsuspend, ModuleTerminate | Staff only |
| `previewUpgrade` | UpgradeProduct with `calconly` | Its `price` is a formatted string; parse it, don't trust it for money. The console works the figure out itself and uses the WHMCS one only as a check |
| `upgradeService` | UpgradeProduct, then UpdateClientProduct `recurringamount` | `newproductbillingcycle`, not `newbillingcycle`; `paymentmethod` and `type` are required |
| `listInvoices` | GetInvoices | No balance in the list |
| `getInvoice` | GetInvoice | `transactions` can be an empty string |
| `setPurchaseOrder` | GetInvoice, then UpdateInvoice `notes` | See Purchase order numbers below |
| `recordPayment` | AddInvoicePayment | Date format `YYYY-MM-DD HH:mm:ss` |
| `listTransactions` | GetTransactions | For statements |
| `listPayMethods`, `addPayMethod` | GetPayMethods, AddPayMethod | Only gateway tokens (RemoteCreditCard); the console never handles card numbers |
| `listDomains` | GetClientsDomains | |
| `checkDomain` | DomainWhois | |
| `registerDomain`, `transferDomain` | AddOrder with `domaintype[]` register or transfer | The transfer code is passed through, never stored |
| `renewDomain` | AddOrder with `domainrenewals` | |
| `getTldPricing` | GetTLDPricing | One call per currency |

## Decisions

**Purchase order numbers.** WHMCS has no PO field on invoices (GetInvoice,
UpdateInvoice and CreateInvoice have none, and the feature request has been
open for ten years). So the console stores PO numbers itself in
`InvoicePoNumber`, one per invoice, and shows them on its own invoice view.
It also writes `PO: <number>` as the first line of the invoice notes, so the
number appears on the PDF WHMCS sends. `withPoNote()` replaces only that
line and keeps any other notes. An organisation's default PO number is on
`Organisation.defaultPoNumber`.

**Prices.** WHMCS has no UpdateProduct action, so catalogue prices can't be
pushed through the API. The console is the source of every customer price
(cost, margin and currency buffer, set monthly) and sends it with each
order as `priceoverride`, and on changes as `recurringamount`. The WHMCS
catalogue prices are placeholders, as the stub's are.

**Monthly invoices.** WHMCS raises invoices from its daily cron. The stub
does the same in `runBillingCycle()`, run nightly by the `stub-billing-run`
job: one invoice per client for everything falling due in the next 7 days,
due on the earliest due date.

**Pro-rating.** A mid-period increase is charged now for the days left,
rounded half away from zero, as its own invoice line. A decrease gives no
credit; the lower price starts at the next period. This matches WHMCS with
upgrade credits switched off, which is the setting to use.

## Where the stub is simpler than WHMCS

- A domain renewal extends the expiry date when it is ordered, not when the
  registrar confirms it.
- Services suspended for non-payment (reason "Overdue on payment") come
  back when the invoice is paid, as WHMCS auto-unsuspend does. The stub
  does not suspend by itself; the reminder and suspension schedule is
  Phase 2 work in WHMCS.
- There is no client credit balance.

## Switching to WHMCS (Phase 2)

1. Fill in each method of `WhmcsBillingAdapter` using the action in the
   table and the mapper in `map.ts`.
2. Set `BILLING_ADAPTER=whmcs`, `WHMCS_API_URL`, and the secrets
   `WHMCS_IDENTIFIER`, `WHMCS_SECRET` and, if WHMCS uses one,
   `WHMCS_ACCESS_KEY`. Allow the console's address in WHMCS's API IP list.
3. Run the contract tests (`tests/billing-contract.ts`) against a WHMCS
   staging copy.
4. Move existing organisations: create a WHMCS client for each and update
   `BillingAccount` (`provider` WHMCS, the new client id). The console
   refuses to mix engines for one organisation.
