# WHMCS API findings (verified 2026-09-27)

Source: developers.whmcs.com, read via WebFetch (a direct curl was blocked by the egress proxy, so every page below was read through WebFetch and summarised by it; example JSON was quoted verbatim). Every page listed was fetched successfully except `updateproduct`, which returns 404.
Index checked: https://developers.whmcs.com/api/api-index/

## Authentication / transport
- URLs: https://developers.whmcs.com/api/authentication/ , /api/getting-started/ , /api/access-control/
- Endpoint: `https://<host>/<whmcs>/includes/api.php`, **POST**.
- Auth: `identifier` + `secret` (API credentials created in Admin; `username`+`secret` accepted for back-compat). Legacy: `username` + `password` (MD5), which is deprecated.
- `action=<ActionName>`, `responsetype=json`.
- IP allowlist by default (Setup > General Settings > Security). Or set `$api_access_key = '...'` in configuration.php, then send `accesskey=<key>` on every request.
- The admin role needs the "API Access" permission.
- Every response has `result` = `success` | `error` (on an error, `message`).
- List responses wrap items in a nested object: `{"invoices":{"invoice":[...]}}`, `{"products":{"product":[...]}}`, and so on. Numbers often come back as strings.

## Clients
### GetClientsDetails (https://developers.whmcs.com/api-reference/getclientsdetails/)
- Req: `clientid` or `email` (one is required), `stats` (bool).
- Resp: `client` {client_id, userid, uuid, firstname/lastname/fullname, companyname, email, address1/2, city, state, postcode, countrycode, countryname, phonenumber, tax_id, status, credit, currency (id), groupid, language, customfields[], users[], taxexempt, defaultgateway, billingcid, email_preferences, marketing_emails_opt_in}, plus `stats` (numdueinvoices, dueinvoicesbalance, unpaidinvoicesamount, productsnumactive, numdomains, ...) when requested.
### AddClient (/api-reference/addclient/)
- Req (required): firstname, lastname, email, address1, city, state, postcode, country (2-letter), phonenumber. Optional: owner_user_id, companyname, address2, tax_id, password2, currency (id), groupid, customfields (base64 serialized array), language, clientip, notes, marketingoptin, noemail, skipvalidation.
- Resp: `clientid`.
### UpdateClient (/api-reference/updateclient/)
- Req: `clientid` or `clientemail`; any of firstname, lastname, companyname, email, address1/2, city, state, postcode, country, phonenumber, tax_id, currency, groupid, customfields (base64 serialized), language, notes, status, paymentmethod, email_preferences[general|product|domain|invoice|support|affiliate], marketingoptin, clearcreditcard, skipvalidation, latefeeoveride, overideduenotices, taxexempt, separateinvoices, disableautocc, overrideautoclose.
- Resp: `clientid`.
### GetClients (/api-reference/getclients/)
- Req: limitstart, limitnum (default 25), sorting (ASC/DESC), status (Active/Inactive/Closed), search (prefix match on email/name/company), orderby.
- Resp: totalresults, startnumber, numreturned, clients.client[] {id, firstname, lastname, companyname, email, datecreated, groupid, status}.

## Catalogue
### GetProducts (/api-reference/getproducts/)
- Req: pid (int or comma list), gid, module.
- Resp: products.product[] {pid, gid, type, name, slug, product-url, description, module, paytype, allowqty, quantity_available, **pricing**, customfields.customfield[], configoptions.configoption[]}.
- **pricing shape**: keyed by currency CODE: `pricing.USD = {prefix, suffix, msetupfee, qsetupfee, ssetupfee, asetupfee, bsetupfee, tsetupfee, monthly, quarterly, semiannually, annually, biennially, triennially}`. **`-1.00` means the cycle is disabled.** Config option sub-options carry the same per-currency pricing block (and there `0.00` is used rather than -1).
### GetCurrencies (/api-reference/getcurrencies/)
- Req: none.
- Resp: totalresults, currencies.currency[] {id, code, prefix, suffix, format, rate}.

## Orders
### AddOrder (/api-reference/addorder/)
- Required: `clientid`, `paymentmethod` (system name, e.g. paypal, mailin).
- Arrays (indexed per item): `pid[]`, `qty[]`, `domain[]`, `billingcycle[]`, `domaintype[]` (register/transfer), `regperiod[]`, `eppcode[]`, `idnlanguage[]`, `customfields[]` and `configoptions[]` (**each base64-encoded serialized array**), `priceoverride[]`, `addons[]` (comma list), `addonsqty[]`, `hostname[]`, `ns1prefix[]`/`ns2prefix[]`, `rootpw[]`, `dnsmanagement[]`, `emailforwarding[]`, `idprotection[]`, `domainfields[]`, `domainpriceoverride[]`, `domainrenewoverride[]`.
- Scalars: promocode, promooverride, affid, **noinvoice**, **noinvoiceemail**, **noemail**, clientip, contactid, nameserver1..5, domainrenewals, addonid/addonidqty/serviceid, addonids[]/addonidsqty[]/serviceids[], servicerenewals[], addonrenewals[].
- Resp: `orderid`, `serviceids` (**comma-separated string**), `addonids` (string), `domainids` (string), `invoiceid`.
### AcceptOrder (/api-reference/acceptorder/)
- Req: orderid; optional serverid, serviceusername, servicepassword, registrar, sendregistrar, autosetup, sendemail. Resp: result only.
### GetOrders (/api-reference/getorders/)
- Req: limitstart, limitnum, id, userid, requestor_id, status.
- Resp: orders.order[] {id, ordernum, userid, contactid, requestor_id, date, amount, status, invoiceid, paymentmethod, fraudoutput, notes, lineitems (type, relid, product, domain, billingcycle, amount, status)}.
### CancelOrder (/api-reference/cancelorder/)
- Req: orderid (the order must be pending), cancelsub, noemail. Resp: result only.

## Services
### GetClientsProducts (/api-reference/getclientsproducts/)
- Req: limitstart, limitnum, clientid, serviceid, pid, domain, username2.
- Resp: totalresults, numreturned, products.product[] {id, qty, clientid, orderid, ordernumber, pid, regdate, name, translated_name, groupname, translated_groupname, domain, dedicatedip, serverid, servername, serverip, serverhostname, suspensionreason, firstpaymentamount, recurringamount, paymentmethod, paymentmethodname, billingcycle, nextduedate, status, username, password, subscriptionid, promoid, overideautosuspend, overidesuspenduntil, ns1, ns2, assignedips, notes, **diskusage, disklimit, bwusage, bwlimit**, lastupdate, customfields.customfield[], configoptions.configoption[] {id, option, type, value}}.
- Surprising: the response includes the service `password`, so do not log raw responses.
### ModuleCreate / ModuleUnsuspend / ModuleTerminate (/api-reference/modulecreate/, /moduleunsuspend/, /moduleterminate/)
- Req: serviceid. Resp: result only.
### ModuleSuspend (/api-reference/modulesuspend/)
- Req: serviceid, `suspendreason` (optional). Resp: result.
### UpgradeProduct (/api-reference/upgradeproduct/)
- Req: serviceid (required), **paymentmethod (required)**, **type** ('product' | 'configoptions', required), calconly (bool), newproductid, **newproductbillingcycle** (not `newbillingcycle`), promocode, configoptions (array: configOptionId => choice id or value; this is NOT base64 here).
- Resp (example): oldproductid, oldproductname, newproductid, newproductname, daysuntilrenewal, totaldays, newproductbillingcycle, **price** (a formatted string such as "$-8.67 USD", not a number), id, orderid, order_number, invoiceid; `upgradeinprogress` (bool) is documented for calconly. The docs give no separate calconly example, so assume the price fields come back without an order being created.
### UpdateClientProduct (/api-reference/updateclientproduct/)
- Req: serviceid plus any of pid, serverid, regdate, nextduedate, terminationdate, domain, firstpaymentamount, recurringamount, paymentmethod, billingcycle, subscriptionid, status, notes, serviceusername, servicepassword, overideautosuspend, overidesuspenduntil, ns1, ns2, dedicatedip, assignedips, diskusage, disklimit, bwusage, bwlimit, suspendreason, promoid, unset[], autorecalc, customfields (base64), configoptions (base64).
- Resp: serviceid.

## Invoices and payments
### GetInvoices (/api-reference/getinvoices/)
- Req: limitstart, limitnum (default 25), userid, status (the standard statuses plus "Overdue"), orderby (id, invoicenumber, date, duedate, total, status), order (asc/desc).
- Resp: invoices.invoice[] {id, userid, firstname, lastname, companyname, invoicenum, date, duedate, datepaid, last_capture_attempt, date_refunded, date_cancelled, subtotal, credit, tax, tax2, total, taxrate, taxrate2, status, paymentmethod, paymethodid, notes, created_at, updated_at, currencycode, currencyprefix, currencysuffix}. Note that the list returns no `balance`.
### GetInvoice (/api-reference/getinvoice/)
- Req: invoiceid.
- Resp: invoiceid, invoicenum, userid, date, duedate, datepaid, lastcaptureattempt, subtotal, credit, tax, tax2, total, balance, taxrate, taxrate2, status, paymentmethod, notes, ccgateway, items.item[] {id, type, relid, description, amount, taxed}, transactions (an array; the example shows `""` when it is empty, so handle both).
- No PO field. No custom fields.
### UpdateInvoice (/api-reference/updateinvoice/)
- Changeable: status, paymentmethod, taxrate, taxrate2, credit, date, duedate, datepaid, **notes**, itemdescription[lineId]/itemamount[lineId]/itemtaxed[lineId], newitemdescription[]/newitemamount[]/newitemtaxed[], deletelineids[], publish, publishandsendemail.
- No PO or custom field. Resp: invoiceid.
### CreateInvoice (/api-reference/createinvoice/)
- Req: userid (required), status, draft, sendinvoice, paymentmethod, taxrate, taxrate2, date, duedate, **notes**, itemdescriptionX / itemamountX / itemtaxedX (the X is a numeric suffix, not an array), autoapplycredit.
- Resp: invoiceid, status.
### AddInvoicePayment (/api-reference/addinvoicepayment/)
- Req: invoiceid, transid, gateway, date ("YYYY-MM-DD HH:mm:ss"), all required; amount (omit it to pay the full amount), fees, noemail. Resp: result only.
### GetTransactions (/api-reference/gettransactions/)
- Req: invoiceid, clientid, transid.
- Resp: transactions.transaction[] {id, userid, currency, gateway, date, description, amountin, fees, amountout, rate, transid, invoiceid, refundid}.
### GetPayMethods (/api-reference/getpaymethods/)
- Req: clientid (required), paymethodid, type (BankAccount/CreditCard).
- Resp: clientid, paymethods[] (a plain array, not nested) {id, type, description, gateway_name, contact_type, contact_id, card_last_four, expiry_date, card_type, remote_token, last_updated}.
### AddPayMethod (/api-reference/addpaymethod/)
- Req: clientid (required), type (BankAccount | CreditCard | RemoteCreditCard), description, gateway_module_name, card_number, card_expiry (MMYY), card_start, card_issue_number, bank_name, bank_account_type, bank_code, bank_account, set_as_default.
- Resp: clientid, paymethodid. It takes raw card numbers (PCI scope), and some tokenised gateways cannot be used through the API.

## Domains
### GetClientsDomains (/api-reference/getclientsdomains/)
- Req: limitstart, limitnum, clientid, domainid, domain.
- Resp: domains.domain[] {id, userid, orderid, regtype, domainname, registrar, regperiod, firstpaymentamount, recurringamount, paymentmethod, paymentmethodname, regdate, expirydate, nextduedate, status, subscriptionid, promoid, dnsmanagement, emailforwarding, idprotection, donotrenew, notes}.
### DomainWhois (/api-reference/domainwhois/)
- Req: domain. Resp: status ("available" | "unavailable"), whois (the raw text).
- There is also a separate DomainGetWhoisInfo action, which returns a registered domain's contact details.
### DomainRegister / DomainRenew / DomainTransfer (/api-reference/domainregister/, /domainrenew/, /domaintransfer/)
- Req: domainid (recommended) or domain. Register also takes idnlanguage, Renew takes regperiod, and Transfer takes eppcode.
- These act on a domain that already exists in WHMCS (normally one created by AddOrder); they send the request to the registrar. Resp: result only.
### GetTLDPricing (/api-reference/gettldpricing/)
- Req: currencyid or clientid.
- Resp: `currency` {id, code, prefix, suffix, format, rate}; `pricing` keyed by TLD without the dot: {tld, categories[], addons{dns, email, idprotect}, group, register{"1": "14.95", "2": ...}, transfer{...}, renew{...}, grace_period, redemption_period}. The year keys are strings. Each call covers one currency.

## Products admin
- **AddProduct exists** (/api-reference/addproduct/): name, gid, type, paytype, module, pricing as `pricing[currencyid][cycle]`, and so on. Resp: pid.
- **There is no UpdateProduct**: the "Products" category of the index lists only AddProduct, and https://developers.whmcs.com/api-reference/updateproduct/ returns 404. You cannot change catalogue pricing through the API. The options are the admin UI, a custom module or addon using the internal PHP API / Capsule DB (tblpricing), or a per-order `priceoverride[]` (AddOrder), or `recurringamount` on an existing service (UpdateClientProduct, with `autorecalc`).
- CreateOrUpdateTLD does exist for domain TLD pricing.

## Purchase order (PO) number on invoices: **NO**
- GetInvoice, UpdateInvoice and CreateInvoice (URLs above) have no PO, reference or custom-field parameter. The only free-text per-invoice field is `notes` (settable on CreateInvoice and UpdateInvoice, returned by GetInvoice and GetInvoices).
- WHMCS feature request "Purchase Order Entry Field" (https://requests.whmcs.com/idea/purchase-order-entry-field) is still "Under consideration" 10 years on. The official suggestions there are (a) a client custom field with "Show on Invoice", which users object to because it is per client and changing it rewrites old invoices, or (b) invoice Notes. Other workarounds: a line item that carries the PO, template edits, or the third-party tripflex/whmcs-purchaseorder gateway module, which uses a custom client field.
- Recommended approach: write "PO: XXXX" into invoice `notes` (CreateInvoice/UpdateInvoice), optionally with a client custom field holding a default PO.

## Surprises / gotchas
- AddOrder `configoptions[]` and `customfields[]` must be base64(serialize(php array)), which means PHP serialization from non-PHP clients. UpgradeProduct `configoptions` is a plain array.
- The AddOrder response IDs are comma-separated strings.
- The UpgradeProduct billing-cycle parameter is `newproductbillingcycle`, and `paymentmethod` and `type` are required even with calconly.
- UpgradeProduct `price` is a formatted currency string.
- GetProducts marks disabled cycles with `-1.00`.
- GetInvoice `transactions` can be an empty string.
- GetInvoices has no balance field; call GetInvoice for it.
- CancelOrder works only on Pending orders.

## Rechecked 2026-09-29 (Phase 2 build)
- **UpdateClientProduct** `configoptions` is base64 of a serialised array: `configoptionid => dropdownoptionid`, or for a quantity `configoptionid => array('optionid' => choiceId, 'qty' => n)`. There is no plain quantity field.
- **UpgradeProduct** example response: `oldproductid, oldproductname, newproductid, newproductname, daysuntilrenewal, totaldays, newproductbillingcycle, price ("$-8.67 USD"), id, orderid, order_number, invoiceid (null when nothing is due)`. The page doesn't say whether the upgrade applies at once or when its invoice is paid.
- **GetInvoice** example: `items: {"item": [...]}` and `transactions: ""` when empty. The console's `list()` also accepts a plain array.
- **CreateOrUpdateTLD**: `extension` (with the dot), `currency_code` (required with pricing), `register[years]` (1 to 10), `renew[years]` (up to 9), `transfer[1]`, plus id_protection, dns_management, email_forwarding, epp_required, auto_registrar, group, grace and redemption settings, display_after. Response: `extension`, `id`.
- Not documented, so checked by the write suite on the test install: whether `priceoverride` includes configurable option prices, what AcceptOrder does to a service with no module, what module actions answer for a product with no module, and whether UpdateInvoice ignores an empty `notes`.
