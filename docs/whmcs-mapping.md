# Billing adapter and WHMCS mapping

Every billing and provisioning call in the console goes through
`BillingAdapter` (`src/server/billing/adapter.ts`). Two implementations
exist:

- `StubBillingAdapter` (`stub/stub-adapter.ts`), for development, CI and
  demo servers. It keeps its state in the `Stub*` tables, so ordering,
  paying and cancelling work end to end.
- `WhmcsBillingAdapter` (`whmcs/whmcs-adapter.ts`), for WHMCS 9.0. Its
  transport is `whmcs/client.ts` and all field mapping is `whmcs/map.ts`.

`BILLING_ADAPTER` chooses one per environment (`stub` or `whmcs`); a
production server refuses to start on `stub`, or on `whmcs` with missing
credentials. WHMCS field names appear only in `whmcs/map.ts`. The API was
checked against developers.whmcs.com on 27 and 29 September 2026; the
findings are in `docs/whmcs-api-notes.md`. Setting WHMCS up is in
`docs/whmcs-setup.md`.

Both adapters pass the same contract tests (`tests/billing-contract.ts`):
the stub against PostgreSQL, and the WHMCS adapter against an in-memory
WHMCS built from the documented responses (`tests/fake-whmcs.ts`) and,
with credentials, against the real install
(`tests/whmcs.integration.test.ts`). Two contract checks differ for WHMCS,
set by fixture flags: saving a card (below) and domains going live
without a registrar.

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
| `getClient` | GetClientsDetails | The currency code comes from `currency_code`, or from the id through GetCurrencies (cached). An unknown client is null |
| `createClient` | AddClient | WHMCS needs state and postcode; Botswana has neither, so placeholders are sent. `noemail` is set: the console sends its own emails. WHMCS 9 requires `password2` (the docs say optional), so a random one is sent and never kept: customers sign in to the console, not WHMCS |
| `updateClient` | UpdateClient | |
| `listProducts` | GetProducts | `-1.00` marks a cycle that is switched off |
| `placeOrder` | AddOrder | Prices are always sent as `priceoverride[]` (see Prices below). A per-user product is one unit with its number of users in the "Users" quantity option (`configoptions[]`, base64 of a PHP-serialised array). Options the console keys by label (operating system) stay on the console's order. `noinvoice` when the change joins the next monthly invoice |
| `acceptOrder` | AcceptOrder, then UpdateClientProduct `status` | `autosetup` on, no email. A service whose product has no module stays pending in WHMCS, so the adapter makes it active. `sendregistrar` only when `WHMCS_ENVIRONMENT=production` |
| `listOrders` | GetOrders | Paged, 250 at a time |
| `cancelOrder` | GetOrders, CancelOrder, then UpdateClientProduct and UpdateInvoice | Pending orders only. CancelOrder doesn't document what it does to services and the invoice, so the adapter cancels them itself |
| `listServices`, `getService` | GetClientsProducts | The response includes the service password; `map.ts` drops it and responses are never logged |
| `runModuleAction` | ModuleCreate, ModuleSuspend, ModuleUnsuspend, ModuleTerminate | Staff only. When WHMCS says the product has no module (licences we set up by hand), the status is set with UpdateClientProduct instead. Any other module failure is shown, never papered over |
| `previewUpgrade` | UpgradeProduct `type=configoptions` with `calconly` | The part-month charge is WHMCS's own, from the Users option price: a formatted string in `total` (`price` for a product change). The live install gives no days, so they come from the service's period. A change of price alone costs nothing now |
| `upgradeService` | UpdateClientProduct (`pid`, `configoptions`, `recurringamount`), then CreateInvoice | The new product or number of users and our price are set at once, because the console provisions the change straight away. The part-month charge goes on an ordinary one-line invoice, taxed like the service. No WHMCS upgrade order: once its invoice is paid WHMCS adds the upgrade to the recurring amount, overwriting our price. The line isn't linked to the service, since CreateInvoice can't say which |
| `listInvoices` | GetInvoices | No balance in the list. Paged |
| `getInvoice` | GetInvoice | `transactions` can be an empty string |
| `setPurchaseOrder` | GetInvoice, then UpdateInvoice `notes` | See Purchase order numbers below |
| `recordPayment` | AddInvoicePayment | Date format `YYYY-MM-DD HH:mm:ss` |
| `listTransactions` | GetTransactions | For statements |
| `listPayMethods` | GetPayMethods | WHMCS marks no default; the first is the one it charges |
| `addPayMethod` | none | Refused as invalid: AddPayMethod needs the full card number even for RemoteCreditCard, and the console never handles card numbers. Cards are saved with DPO instead |
| `listDomains` | GetClientsDomains | |
| `checkDomain` | GetTLDPricing, GetClientsDomains `domain`, DomainWhois | Supported means WHMCS has pricing for the ending. A name any WHMCS client holds is taken, whatever whois says |
| `registerDomain`, `transferDomain` | AddOrder with `domaintype[]` register or transfer | The transfer code is passed through, never stored |
| `renewDomain` | AddOrder with `domainrenewals` | The expiry moves when the registrar confirms, not when ordered |
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

**Prices.** The console is the source of every customer price (the
approved price books) and sends it with each order as `priceoverride`,
and on changes as `recurringamount`. WHMCS's own catalogue is kept the
same by `npm run whmcs:sync`, so WHMCS's pages and part-month charges
match. WHMCS has no UpdateProduct or product group action, so products
go through the Fourth Generation Console Sync addon
(`whmcs/modules/addons/fourthgen_console`), which accepts only signed,
fresh, unseen requests from allowed addresses and can only change product
groups, products, descriptions, visibility and prices. Domain endings go
through the API's CreateOrUpdateTLD. The sync is a dry run unless run with
`--apply --staff <email>`, which writes one staff audit entry. Two enabled
markets with the same currency must approve the same price, or it stops.

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

## Checked on the live install

The docs don't say, so these were checked on the test install (WHMCS
9.0.9, 29 September 2026):
- `priceoverride` with the Users option gives exactly our price, not our
  price plus the option's. Confirmed: 3 users at P570.00 invoiced P570.00.
- A product without a module: AcceptOrder with `autosetup` makes the
  service Active (not pending, as assumed), and module actions answer
  "Service not assigned to a module." The adapter still sets the status
  itself, which does no harm.
- Paying an upgrade invoice **does** change the recurring amount: WHMCS
  adds the upgrade to it (P950.00 set, P200.00 upgrade paid, P1,150.00
  after). So seat changes no longer use WHMCS upgrade orders (see
  `upgradeService` above).
- UpdateInvoice ignores an empty `notes`, and a space clears it.
  Confirmed.
- WHMCS reads API flags the PHP way, so `"false"` counts as on; flags we
  want off are sent as `"0"`.
- AddClient needs `password2`, and a phone number is kept as digits only.

## Switching to WHMCS

1. Set WHMCS up as in `docs/whmcs-setup.md`: the API role and credential,
   the IP restriction or access key, and the sync addon.
2. Set `BILLING_ADAPTER=whmcs`, `WHMCS_API_URL`, `WHMCS_ENVIRONMENT`, and
   the secrets `WHMCS_API_IDENTIFIER`, `WHMCS_API_SECRET`,
   `WHMCS_SYNC_SECRET` and, if WHMCS uses one, `WHMCS_ACCESS_KEY`.
3. Run `npm run whmcs:sync -- --apply --staff <your email>` to create the
   products and prices, then `npm run test:whmcs` (add
   `WHMCS_TEST_WRITES=yes` on the test install only).
4. Move existing organisations: create a WHMCS client for each and update
   `BillingAccount` (`provider` WHMCS, the new client id). The console
   refuses to mix engines for one organisation.
