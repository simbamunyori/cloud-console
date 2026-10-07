# Setting up WHMCS for the console

How to prepare WHMCS 9.0 so the console can use it as its billing engine.
Do the steps in order. The console never needs a WHMCS admin password:
it uses one API credential with only the permissions listed here, and
one shared secret for the price sync addon.

Our install: `https://billing.fourthgeneration.technology`, WHMCS 9.0.9,
currencies BWP (default), ZAR and USD.

Menu paths are for the WHMCS 9.0 admin area, where the Configuration menu
is the wrench icon at the top right. If a label differs on your install,
the place is the same; tell us and we'll update this page.

## 1. Currencies

**Configuration > System Settings > Currencies.** You need exactly these
codes: `BWP`, `ZAR` and `USD`. The console finds each currency by its code,
so the order and the WHMCS ids don't matter.

- Leave "Update exchange rates automatically" off. The console converts
  nothing through WHMCS: every order carries its price in the client's
  own currency.
- A client's currency can't change once they have an invoice. The console
  sets it from the customer's market at sign-up.

## 2. A dedicated admin user for the console

**Configuration > System Settings > Administrator Users > Add New
Administrator.**

- Name it `Cloud Console API`, with an email address your team reads.
- Use a long random password that nobody logs in with, and turn on
  two-factor authentication for it.
- Give it the most limited administrator role you have. What the console
  can do through the API is set by the API role (step 3), not this
  administrator role. The API credential just has to belong to an active
  admin user.

## 3. The API role

**Configuration > System Settings > Manage API Credentials > API Roles >
Create API Role.**

- Role name: `Cloud Console`.
- Description: `Used by the Cloud Console. Change only with the console team.`
- Allowed API actions: tick **only** these. They are grouped as in the
  WHMCS API index.

| Category | Actions | What the console uses them for |
| --- | --- | --- |
| Client | `GetClientsDetails`, `AddClient`, `UpdateClient`, `GetClientsProducts`, `GetClientsDomains`, `UpdateClientDomain` | A customer's billing account, services and domains; bringing domains over from Odoo |
| Orders | `GetProducts`, `AddOrder`, `AcceptOrder`, `GetOrders`, `CancelOrder` | Ordering from the marketplace; staff accepting set-up orders |
| Service | `ModuleCreate`, `ModuleSuspend`, `ModuleUnsuspend`, `ModuleTerminate`, `UpgradeProduct`, `UpdateClientProduct` | Staff actions on services; changing the number of users |
| Billing | `GetInvoices`, `GetInvoice`, `CreateInvoice`, `UpdateInvoice`, `AddInvoicePayment`, `GetTransactions`, `GetPayMethods`, `AddPayMethod` | Invoices, part-month charges for seat changes, purchase order notes, recording card and bank payments, statements |
| Domains | `DomainWhois`, `GetTLDPricing`, `CreateOrUpdateTLD` | Domain search, and syncing domain prices from our price books |
| System | `GetCurrencies` | Finding the BWP, ZAR and USD currency ids |

That is 28 actions. Leave everything else unticked. In particular, the
console never needs:
- anything under Support, Tickets, Users, Authentication or Affiliates;
- `DeleteClient`, `DeleteOrder` or `AddProduct`. Products are created by the
  addon in step 6, which only does product work.

## 4. The API credential

**Configuration > System Settings > Manage API Credentials > API
Credentials > Generate New API Credential.**

- Admin user: `Cloud Console API` (step 2).
- API roles: `Cloud Console` only (step 3).
- Description: the environment it is for, e.g. `Console test` or
  `Console production`. Make one credential per environment, so one can be
  revoked without touching the other.

WHMCS shows the **identifier** and **secret** once. Put them straight into
the console's environment settings, never in chat, email or a ticket:

| Variable | Value |
| --- | --- |
| `BILLING_ADAPTER` | `whmcs` (development and demo servers use `stub`) |
| `WHMCS_API_URL` | `https://billing.fourthgeneration.technology/includes/api.php` |
| `WHMCS_API_IDENTIFIER` | The identifier |
| `WHMCS_API_SECRET` | The secret (secret) |
| `WHMCS_ACCESS_KEY` | Only if you use an access key (step 5), secret |
| `WHMCS_ENVIRONMENT` | `test` now; `production` after the launch reset (section 9) |

If a secret is ever exposed, delete that credential in the same screen and
generate a new one.

## 5. Who may call the API: IP restriction or access key

WHMCS refuses API calls from any address it doesn't know. Choose one of
the two ways below.

**A fixed server address (production).**
**Configuration > System Settings > General Settings > Security > API IP
Access Restriction.** Add the console server's public IP address with a
note such as `Cloud Console production`. Nothing else is needed.

**An access key (test, or anywhere the address changes).**
The environment where Claude builds and tests the console has no fixed
address, so for the test install use an access key instead:
1. Make a long random key using letters, numbers and `! @ # $ % . ( ) * [ ] - _`
   only, for example with `openssl rand -base64 36 | tr -d '/+='`.
2. Add this line to `configuration.php` in the WHMCS root:
   `$api_access_key = 'your-key-here';`
3. Set the same key as `WHMCS_ACCESS_KEY` in the console's environment.

An API call with the right access key is allowed from any address. It
still needs a valid identifier and secret, and it can still do only what
the API role allows. Before launch, remove the access key (or change it)
and use the IP restriction.

**Behind Cloudflare.** If WHMCS itself sits behind Cloudflare or another
proxy, add the proxy's ranges under **Configuration > System Settings >
General Settings > Security > Trusted Proxies**. Otherwise WHMCS sees
Cloudflare's address instead of the caller's, and the IP restriction and
the addon's allowlist compare the wrong address.

## 6. The price sync addon

WHMCS's API can add a product but can't change one afterwards, and it
can't create product groups. So the console ships a small addon,
`Fourth Generation Console Sync`, which does only this:

- Creates and updates **product groups**: name, headline and visibility.
- Creates and updates **products**: name, description, visibility, and
  the monthly price in each currency. There is no set-up fee.
- For a product sold per user, keeps its **"Users" quantity option** and
  that option's price per user in each currency. The product itself then
  costs 0.00, and WHMCS works out a change in users from the option.

It can't touch clients, invoices, services, orders, payments, settings or
anything else. Every request:
- must come from an allowlisted IP address;
- is signed with HMAC-SHA256 over a timestamp and the exact request body,
  using a shared secret;
- is refused if the timestamp is more than 5 minutes old, or if the same
  request id has been seen before (a replay).

Every change it makes is written to the WHMCS activity log
(**Configuration > System Logs > Activity Log**, lines starting
`Console sync:`). The console writes the same changes to its own staff
audit log.

To install it:
1. Copy `whmcs/modules/addons/fourthgen_console/` from the console
   repository into `modules/addons/` in the WHMCS root.
2. **Configuration > System Settings > Addon Modules.** Find `Fourth
   Generation Console Sync` and select **Activate**. This creates its one
   table, which remembers recent request ids.
3. Select **Configure** and set:
   - **Shared secret**: the output of `openssl rand -hex 32` (64 letters
     and digits; the addon refuses anything under 32 characters). Set the
     same value as `WHMCS_SYNC_SECRET` in the console's environment.
   - **Allowed IPs**: the addresses allowed to call it, one per line; a
     range like `203.0.113.0/24` works too. On the test install, add the
     address Claude reports when it first runs the sync. That address
     changes, so it may need updating. In production, add only the console
     server.
   - **Access control**: tick only Full Administrator. This controls who
     sees the addon's page in the admin area. The sync endpoint doesn't
     use an admin login.
4. Save. The addon page at **Addons > Fourth Generation Console Sync** then
   shows its status and the last 20 syncs.

The console calls
`https://billing.fourthgeneration.technology/modules/addons/fourthgen_console/sync.php`.
`company.php` beside it takes the company push (section 10). Nothing else in
the addon folder answers web requests.

To change the shared secret, change it in WHMCS and in the console at the
same time. Requests signed with the old one are refused.

To run the sync from a checkout of the console with the environment set:
- `npm run whmcs:sync` shows what would change, and changes nothing.
- `npm run whmcs:sync -- --apply --staff you@fourthgen.co.bw` makes the
  changes. You must be console staff allowed to manage pricing; the run is
  written to the staff audit log with every change.

On the production server the same commands are `console whmcs-sync` and
`console whmcs-sync --apply --staff you@fourthgeneration.technology`.
A new server's catalogue has no WHMCS products yet: the first applied sync
creates them and links each one.

It also sets each domain ending's register, renew and transfer prices
through the API (`CreateOrUpdateTLD`). If two markets that are switched on
share a currency (Zimbabwe and International are both USD) and approved
different prices, it stops and says which: WHMCS holds one price per
currency.

## 7. Payment gateways

**Configuration > System Settings > Payment Gateways.** The console records
payments under these gateway system names:

| Payment | WHMCS gateway | System name |
| --- | --- | --- |
| Bank transfer (EFT) | Bank Transfer | `banktransfer` |
| Card | DPO (once the DPO module is installed) | Set `DPO_WHMCS_GATEWAY` to its system name |

Activate Bank Transfer now. Its instructions text is not used: the console
shows each market's bank details itself. Leave the card gateway until the
DPO change (pull request #3) is live.

## 8. Settings the console relies on

- **Downgrades:** turn "Credit on Downgrade" off (under **General
  Settings**). The console gives no credit for a mid-month decrease; the
  lower price starts next month.
- **Invoices:** **Configuration > System Settings > Automation Settings >
  Billing Settings.** Leave "Invoice Generation" at 7 days before the due
  date. The console describes monthly invoices as raised a week ahead.
- **Suspension:** in the same Automation Settings, choose the suspension
  and termination days, and keep "Enable Unsuspension" on so a paid
  invoice brings a suspended service back. The console shows these days
  to customers from its own settings, so tell us when you set them.
- **Emails:** the console sends its own emails to customers (invoices,
  payments, set-up), so WHMCS doesn't need to. Under **Configuration >
  System Settings > Email Templates**, disable the client emails for new
  accounts, orders, invoices, payment confirmations and reminders.
- **Registrar:** international domains go through the Openprovider
  registrar module (section 10). .bw stays a staff task until BOCRA
  accredits us; the console then talks to the .bw registry itself.
- **Cron:** make sure the WHMCS cron runs every 5 minutes (**Configuration
  > System Settings > Automation Settings** shows the command and the last
  run). WHMCS raises the monthly invoices from it.

- **WHOIS for .co.bw and .bw:** WHMCS has no WHOIS server for them, so
  domain search fails without this file at
  `resources/domains/whois.json` (owned by the web server user):

  ```
  [{"extensions": ".co.bw,.bw", "uri": "socket://whois.nic.net.bw", "available": "No Object Found"}]
  ```

  "No Object Found" is what the .bw registry answers for a free name.

## 9. Test install now, clean install at launch

The install is our test environment until launch:
- `WHMCS_ENVIRONMENT=test`.
- The console's full contract tests run against it with
  `WHMCS_TEST_WRITES=yes`. They create clients, orders, invoices and
  payments.

Before launch:
1. Reset WHMCS to a clean database.
2. Repeat steps 1 to 8 on it, with a new credential and a new sync secret.
3. Set `WHMCS_ENVIRONMENT=production`. The write tests then refuse to run
   against it, whatever else is set.
4. Replace the access key with the production server's IP address (step 5).
5. Run the price sync once to create the product groups, products and
   prices from the approved price books.

## 10. Company details, invoices and Openprovider (strategy U1)

Admin > Company in the console holds our legal name, registration, address,
contacts, logo and bank details. **Send to WHMCS** on that page puts them
into WHMCS through the same addon as the price sync (`company.php`, signed
and checked the same way). It may change only:

- the general settings `CompanyName`, `Email`, `Domain`, `InvoicePayTo`,
  `LogoURL`, `SystemEmailsFromName`, `SystemEmailsFromEmail`, `Signature`,
  `EmailGlobalHeader`, `EmailGlobalFooter`, `EmailCSS`, `MaintenanceMode`,
  `MaintenanceModeMessage`, `MaintenanceModeURL`,
  `AutoRenewDomainsonPayment`, `DefaultNameserver1` to `4` and `Template`
  (only `fourthgen` or `twenty-one`);
- the invoice emails: Invoice Created, Credit Card Invoice Created,
  Invoice Payment Reminder, the three overdue notices and Invoice Payment
  Confirmation (default language only);
- the addon's own table of company details, bank details per currency and
  the logo, which the `fourthgen` theme's invoice PDF reads;
- the Openprovider registrar module's username, password and test mode,
  while Openprovider is switched on in Admin > Partners.

Email templates can't carry Smarty tags that run code (`{php}`,
`{include}`, `{fetch}` and the like) or scripts. Every change is in the
WHMCS activity log (lines starting `Console company push:`, never with the
password) and in the console's staff audit log. **Check what would change**
runs it as a dry run.

What it leaves WHMCS like:
- maintenance mode on, sending anyone who opens the client area to
  `https://console.fourthgeneration.technology/app`;
- the `fourthgen` theme (Twenty-One with our invoice PDF): logo, company
  details, registration, the customer, lines and totals, and the bank
  details for the invoice's currency with the invoice number as the
  reference;
- invoice emails in our words and frame, linking to the invoice in the
  console. WHMCS's client emails stay disabled (section 8): the console
  sends its own branded invoice emails once Admin > Features > Invoice
  emails is on. These are for an email staff send from WHMCS by hand;
- "Auto Renew on Payment" on, so a paid renewal invoice renews the domain
  at Openprovider.

### Installing (one command on the server)

On the server, as a user who can use sudo, from the current console
release:

```
r=/opt/console/current/whmcs; w=/var/www/billing; t=$(mktemp -d) && \
sudo cp -r $r/modules/addons/fourthgen_console $w/modules/addons/ && \
sudo cp -r $r/templates/fourthgen $w/templates/ && \
(curl -fsSL https://github.com/openprovider/Openprovider-WHMCS-domains/archive/refs/heads/master.tar.gz || \
 curl -fsSL https://github.com/openprovider/Openprovider-WHMCS-domains/archive/refs/heads/main.tar.gz) | tar -xz -C $t && \
sudo cp -r $t/*/modules/registrars/openprovider $w/modules/registrars/ && \
sudo cp -r $t/*/includes/hooks/. $w/includes/hooks/ && \
sudo chown -R --reference=$w/modules $w/modules/addons/fourthgen_console $w/modules/registrars/openprovider $w/templates/fourthgen $w/includes/hooks
```

Copying the addon over the old one upgrades it to 1.1.0 in place; WHMCS
runs its upgrade on the next admin page and keeps the secret and allowed
IPs.

### Then, in the admin areas

1. WHMCS: **Configuration > System Settings > Domain Registrars**, find
   Openprovider and select **Activate**. Leave its settings empty: the
   console fills them.
2. Console: **Admin > Partners > Openprovider.** Enter the API username
   and password, choose Live, **Save settings**, **Test connection**, then
   **Switch on**.
3. Console: **Admin > Company.** Check the details, logos and bank
   accounts, then **Check what would change** and **Send to WHMCS**.
4. Console: **Admin > Features.** Turn on Domains through Openprovider,
   Invoice and quote PDFs and Invoice emails when ready.

## Checking it works

With the variables set, run `npm run test:whmcs`. Without
`WHMCS_TEST_WRITES=yes` it only reads:
- it signs in with the credential;
- it finds BWP, ZAR and USD;
- it lists products;
- it reads domain pricing;
- it calls each read action in the role;
- with `WHMCS_SYNC_SECRET` set, it checks the addon accepts the console's
  signature (the request it sends changes nothing).

The write suite needs the price sync to have run first, so that WHMCS has
per-user products and domain prices in BWP.

A missing permission shows as WHMCS's own refusal, naming the action. The
write actions are checked by the full suite (`WHMCS_TEST_WRITES=yes`).
