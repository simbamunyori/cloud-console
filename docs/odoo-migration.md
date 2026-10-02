# Bringing clients over from Odoo

Milestone 9b. Staff with the Admin role do this at **Staff console >
Client migration** (`/admin/migration`). Nothing reaches a customer until
the cutover date you choose.

The steps:

1. Add off-site backups first (see "Before you start").
2. Export five files from Odoo (four are exports, one is our domains
   template).
3. Upload them. The console makes a dry run and shows what it would bring
   over, with any problems and warnings. Nothing is written yet.
4. Fix problems in Odoo or in the files, and upload again until there are
   none. Match any Odoo products the console didn't recognise.
5. Approve the dry run. The import runs in the background, within five
   minutes.
6. Stop invoicing in Odoo.
7. Choose the cutover date. Welcome emails go out at 08:00 that day.

## Before you start

- **Off-site backups.** Real customer data should not go in until the
  nightly backups are copied off the server. Create a Contabo Object
  Storage bucket and set the `OFFSITE_S3_*` variables (README,
  "Environment variables"). The migration page shows a warning until
  `OFFSITE_S3_BUCKET` is set.
- **WHMCS API role.** The import uses `UpdateClientDomain`. Tick it in
  the `Cloud Console` API role (docs/whmcs-setup.md, step 3; 28 actions).
- **Markets and price books.** Each customer's country must be an
  enabled market, and their subscriptions must be in that market's
  currency.

## The Odoo exports

In each Odoo list: select all records, then **Action > Export**. Tick
"I want to update data (import-compatible export)" so the IDs are
included, choose CSV, and add the fields below. Column order doesn't
matter; the console finds columns by name, and both Odoo's labels and
its technical names work. Example files with these exact columns can be
downloaded from the migration page.

### Customers (required)

Contacts app, filtered to the companies and people you invoice.

| Field | Technical name | Needed |
| --- | --- | --- |
| ID | `id` | Yes |
| Name | `name` | Yes |
| Email | `email` | Yes, it becomes the owner's sign-in unless a contact is marked Owner |
| Phone, Mobile | `phone`, `mobile` | No |
| Street, Street2, City, Zip, Country | `street`, `street2`, `city`, `zip`, `country_id` | Country is needed to pick the market |
| Tax ID | `vat` | No |
| Company ID | `company_registry` | No |

### Contact people (optional)

Contacts app, the individual people under each company.

| Field | Technical name |
| --- | --- |
| ID | `id` |
| Related Company/ID | `parent_id/id` |
| Name, Email, Phone, Mobile | `name`, `email`, `phone`, `mobile` |
| Address Type | `type` |

Each person with an email gets a console sign-in. Invoice addresses get
the Billing role and everyone else Read only, except the owner. To choose
roles yourself, add a column **Console role** with Owner, Admin, Billing
or Read only.

### Subscriptions (required)

Subscriptions app, In progress, with their lines. Odoo leaves a
subscription's own fields blank on its second and later lines; the
console carries them down.

| Field | Technical name | Needed |
| --- | --- | --- |
| Order Reference | `name` | Yes |
| Customer/ID | `partner_id/id` | Yes |
| Recurring Plan | `plan_id` | Yes: Monthly, Quarterly, 6 Months or Yearly |
| Next Invoice | `next_invoice_date` | Yes, must be after today |
| Start Date | `start_date` | No |
| Currency | `currency_id` | Yes |
| Status | `subscription_state` | Closed subscriptions are skipped |
| Order Lines/Product | `order_line/product_id` | Yes |
| Order Lines/Description | `order_line/name` | No |
| Order Lines/Quantity | `order_line/product_uom_qty` | Yes |
| Order Lines/Unit Price | `order_line/price_unit` | Yes |
| Order Lines/Discount (%) | `order_line/discount` | No |

Add these columns by hand in the spreadsheet where they apply. Empty
means "on our servers, no review date".

| Column | What to put |
| --- | --- |
| Hosted at | Contabo, SiteGround or another provider's name |
| Server or account | The server name or account, for whoever does the work |
| Hosting notes | Anything else they need |
| Price review date | When to look at the kept price again (optional) |
| Domain | The website address the service is for |

### Domains (optional)

Odoo has no domain records, so fill in our template from the registrar.
Columns: Domain, Customer ID (the Odoo customer ID), Registered on,
Expires on, Renewal price (for the whole period), Years, Registrar,
Auto renew (Yes or No). The TLD must be one the console sells.

### Unpaid invoices (optional)

Invoicing app, Customer Invoices, filtered to Posted and Not paid or
Partially paid.

| Field | Technical name |
| --- | --- |
| Number | `name` |
| Customer/ID | `partner_id/id` |
| Invoice/Bill Date | `invoice_date` |
| Due Date | `invoice_date_due` |
| Amount Due | `amount_residual` |
| Total | `amount_total` |
| Currency | `currency_id` |
| Type | `move_type` |

Each becomes an opening-balance invoice in WHMCS for the amount still
owed, dated as in Odoo, without tax (the tax was on the Odoo invoice).
Credit notes are not brought over; the dry run lists them so you can
settle them by hand.

## How the dry run decides

- **Customers** each become a new console account, remembered by their
  Odoo ID, so a later upload adds to the same account. A customer with
  nothing running and nothing owed is left out. A staff email, or an
  owner who already owns a console account that wasn't migrated, is a
  problem that stops the import; add those services to that account by
  hand.
- **Products** are matched by name to the catalogue. A close match (most
  words in common) is suggested; you can change it. Anything you leave
  unmatched becomes a "Legacy services" product: always hidden, never
  offered, priced at zero in the price book. Its customers keep paying
  their Odoo price.
- **Prices.** Every service keeps the price it had in Odoo, flagged
  "Kept price". Price book changes never touch it. A seat change on a
  kept-price service is charged pro rata at the kept price per seat. The
  optional review date shows on the migration page and the customer page
  when it comes due; nothing changes by itself on that day.
- **Quantity.** A per-user product keeps its quantity. Any other product
  with a quantity above one becomes one service at the line total, with
  a warning.
- **Due dates.** Each service's next invoice date carries over, so WHMCS
  invoices it on the same day Odoo would have.
- **Running twice is safe.** Each customer, person, service, domain and
  invoice is recorded once imported. A new upload only brings over what
  is new. If an import stops part way, the page says so and offers to
  carry on.

## Services hosted elsewhere

A service marked as hosted at Contabo, SiteGround or elsewhere is billed
as normal, but the console can't switch it off or on itself. When it is
suspended, unsuspended or cancelled in billing, a staff task is made in
**Tasks** with the server and notes. Late tasks send a reminder email
once a day to whoever has it, or to the market's support address.

On the customer's page, under **Services**, staff can change where it
runs. **Move to our servers** switches it back to normal management;
the change is in the audit log.

## Cutover

Choose the cutover date on the migration page after the import has run.
At 08:00 that day each person brought over gets an email that their
account is ready. People without a password get a link to choose one,
valid for 14 days; anyone who can already sign in gets a sign-in link.
Until then they get nothing: WHMCS emails stay off and the console sends
none. The date can be moved or cleared until the emails have gone.

## After the import

1. Stop invoicing in Odoo: in Subscriptions, close the imported
   subscriptions (or set their next invoice date far ahead) so nobody is
   invoiced twice.
2. Check a few customers in the staff console and in WHMCS.
3. Set the cutover date.
