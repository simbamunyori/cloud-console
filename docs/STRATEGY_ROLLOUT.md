# Fourth Generation Technologies: strategy upgrade

This is an upgrade to the live platform, not a rebuild. Everything in
`docs/FINAL_BUILD.md` is built, deployed and in use: the website, the customer and staff
consoles, WHMCS billing, Microsoft and Google sign-in, Thapelo, the free tools,
automated pricing and the Odoo migration tool. This document adds to that platform.
Where it conflicts with earlier documents, this file wins.

## How this upgrade must work

1. **Extend, never rebuild.** Work on top of `main`. Reuse the existing components,
   adapters, catalogue, price books, site editor and design system. Do not replace or
   rewrite working features.
2. **Nothing is removed.** We are adding positioning, products and functions. Existing
   pages, products, prices and customer data stay as they are.
3. **Safe database changes.** Migrations only add tables and columns, run automatically
   on deploy, and never delete or rewrite existing data.
4. **New features ship switched off.** Each one sits behind a switch in the staff console
   (Admin > Features) and stays invisible to customers until an Admin turns it on.
5. **Settings in the admin area, not the server.** Partner credentials, company details,
   bank details and provider settings are entered in staff console screens, stored
   encrypted, and audited. The only server-side settings are the ones that already
   exist.
6. **Same delivery rules.** One PR per milestone, all checks green before review, merge
   deploys automatically. Hand steps are exact clicks in the admin area. I should never
   need to rerun setup scripts for this upgrade.
7. **Single server for our own platform.** We go live on the current server. Off-site
   backup, failover and the Botswana move for our own platform are a separate, later
   prompt (section 4). This does not limit what we sell: customer services such as
   off-site backup and the 24/7 SOC are delivered through white-label partners and stay
   advertised.
8. **White-label partners stay invisible.** Where a partner delivers a service (backup,
   SOC, licences), customers only ever see Fourth Generation Technologies: our name,
   our console, our invoice, our emails. Partner names never appear in customer-facing
   pages, emails, invoices or reports.

## 1. The positioning we are adding

- **Headline (unchanged):** Everything your business needs online. Handled.
- **Supporting line (new):** One account. One team. Cloud, security, resilience and
  connectivity, handled.
- **Primary customer:** businesses of roughly 10 to 150 people; then professional
  services, schools and colleges, and mid-tier contractors.
- **Pillar order:** cloud and productivity; security and SOC; resilience and compliance;
  digital growth; business apps (Thebe). Connectivity stays hidden until the BOCRA
  licence is granted.

## 2. Milestones

### U1: Go-live essentials

These make the platform complete for real customers today.

1. **Openprovider, fully integrated and active now.** International domains (.com,
   .africa, .co.za and the rest) are registered, renewed, transferred and managed
   through Openprovider automatically:
   - Connect Openprovider as the registrar in WHMCS (its registrar module) and in
     the console's domain adapter.
   - Credentials entered in the staff console (Admin > Partners > Openprovider), with
     a Test connection button.
   - Domain search uses Openprovider for live availability; cost prices come from
     Openprovider into the price books, and selling prices follow the automated
     14-day pricing.
   - Registration runs automatically once an order is paid. Renewals, transfers (with
     auth code), nameserver and DNS changes, and contact updates work from the
     customer console. Failures create a staff task.
   - .bw stays manual (staff task) until BOCRA accreditation. Build the .bw registrar
     connection as an adapter now, configured in Admin > Partners > .bw registry, so
     it can be switched on once BOCRA confirms its requirements.
2. **Branded invoices.** Every invoice, in the console, by email and as PDF, carries:
   - the Fourth Generation Technologies logo, legal name Fourth Generation
     Technologies (Pty) Ltd, registration BW00001816431, address, phone and email
   - bank details for EFT, entered per market and currency in Admin > Company >
     Banking (bank, branch, account name, account number, branch code, SWIFT),
     shown with the invoice number as the payment reference
   - tax details where they apply, payment terms, and a link to pay online when card
     payments are on
   - the same layout for WHMCS-generated invoices: update the WHMCS invoice
     template and its email templates to match, so a customer never sees an
     unbranded invoice
3. **Branded quotations.** Quotes are generated from the catalogue and price books as
   branded PDFs with the logo, company details, line items, validity (14 days by
   default), terms, bank details, and an Accept online link. Accepting turns the quote
   into an order and subscriptions, as already built. Quotes can be emailed from the
   staff console and downloaded by the customer.
4. **Company settings screen.** Admin > Company holds the legal name, registration,
   address, contacts, logos (light and dark), bank details and invoice footer text, used
   everywhere: invoices, quotes, emails, the website footer and WHMCS. Pre-fill it with
   the values already in the platform.
5. **Selling points stay.** Keep the off-site backup and 24/7 SOC messaging for
   customers. The only wording to hold back is "data kept in Botswana", until the data
   centre move happens; put it behind a switch.
6. **WHMCS tidy-up.** Replace the remaining WHMCS defaults (sender email, company
   domain, Pay To text) with the Company settings, and keep the WHMCS client area in
   maintenance mode redirecting to the console.

### U2: Positioning on the site

1. Add the supporting line under the hero and in the meta description, editable in the
   site editor.
2. Add a "Who we help" block for the primary customer and the three secondary
   segments, hidden until a Publisher approves it.
3. Order the What we look after section and the mega menus to follow the pillar order.
4. **Dark theme as the default.** The navy (dark) theme becomes the default for the
   website and the console. Visitors can still switch to light, and their choice is
   remembered.
5. **Fix readability in dark.** Some sections do not read properly in dark, most clearly
   the Email and Microsoft 365 section with the customer signature on a laptop and
   phone. Sections that show product screens, emails, signatures, websites in a
   browser frame or documents keep a white panel in both themes, so what they show
   always reads as it would on a real screen. Everything else (hero, menus, plans, proof,
   FAQ, footer) uses the navy background.
6. Check every section, the Insights strip, the announcement bar, Thapelo, mega
   menus, forms and the console screens in both themes, with screenshots at 390 and
   1440 px, and fix any contrast below WCAG AA. The Insights strip must look right in
   dark from the first published article.

### U3: Security and backup included by default

1. Every Microsoft 365, Google Workspace and hosting plan includes a baseline of
   email security and backup. What each plan includes is set in the catalogue, not in
   code.
2. Each included item is a catalogue product with its own cost, so every plan shows its
   true cost.
3. Plan margin report at /admin/pricing: cost, price and margin per plan and market at
   current rates, with a warning below a margin floor set by an Admin.
4. The plans table and the cost calculator show what is included.
5. **Off-site backup for customers, white-label.** A backup provider adapter, set up in
   Admin > Partners > Backup provider (name, API endpoint, keys, storage region,
   custom fields, Test connection), with a manual adapter as fallback. Customers
   subscribe in the console and see backup status, last successful backup, retention
   and restore requests, all under our brand. The provider's name never appears to
   customers.

### U4: The security score as a sales and retention tool

1. Score each customer from real checks, each with a plain explanation and a fix: email
   domain (SPF, DKIM, DMARC, MX, certificate), two-step login coverage, backup
   status per service, device coverage from the security provider (U5), and Microsoft
   365 or Google Workspace settings (U6) once connected.
2. Every failing item offers the product that fixes it, added in one click.
3. A monthly security report per customer, in the console and by email as a branded
   PDF.
4. A staff view of all scores, lowest first.

### U5: Managed security and the SOC, built now, published later

Build the whole module now so it can go live the day a partner agreement is signed, with
no further development.

1. **Provider setup** in the staff console (Admin > Partners > Security provider):
   choose the provider type, enter its name, API endpoint, keys, webhook secret,
   tenant settings and any custom fields the provider requires (free-form key and value
   fields, so new requirements need no code), then Test connection. Several providers
   can be stored; one is active.
2. **Provider adapter** with these operations: create a customer tenant, return the agent
   installer or enrolment link, list devices and their health, receive alerts and incidents
   by webhook or polling, fetch reports, suspend and remove a tenant. Ship a manual
   adapter (each operation becomes a staff task, with devices, incidents and reports
   entered by hand) and a generic webhook adapter. A provider-specific adapter is a
   small PR once a partner is chosen.
3. **Customer experience** (built, hidden until switched on): subscribe to managed
   security from the marketplace; see the installer link, device coverage, open incidents
   with severity and status, what we are doing about each, and monthly reports; all
   under our brand and invoice.
4. **SOC operations view for staff:** a live incident queue across customers,
   severity-based response targets, assignment, timeline, customer notifications by
   email, and escalation.
5. **Publishing:** the 24/7 SOC stays in the website's messaging now. The subscribe
   button, the customer security pages and the products go live when an Admin
   switches on Admin > Features > Managed security after the agreement is signed;
   until then, interest is captured as a pre-sales lead.
6. **Partner evaluation:** add `docs/soc-partner-evaluation.md`, a checklist for the
   business to score candidates on white-label support, API for tenants and incidents,
   per-device pricing, minimum commitments, data location, Microsoft 365 and Google
   Workspace coverage, response times and Africa presence. Candidates to evaluate:
   Huntress, CyberQuell, Blackpoint Cyber, ArmorPoint, CyberGuard360, SOCSoter,
   Layer7 (South Africa), Westcon-Comstor OneSOC, ThreatDefence, and the security
   vendors available through First Distribution. Do not state facts about these providers
   anywhere in the product.

### U6: Microsoft 365 and Google Workspace automation

1. A licensing adapter for Microsoft CSP (through First Distribution) and Google
   Workspace (through Digicloud), configured in Admin > Partners, with the existing
   manual fulfilment as the fallback.
2. Customers change licence counts in the console; billing follows with proration.
3. Daily licence sync when connected; differences create a staff task.
4. Customer consent flows for tenant access (Microsoft delegated admin, Google
   reseller access), feeding the security score.

### U7: The business structure in the staff console

1. Units: Sales and pre-sales, Service delivery, Customer support, Operations (NOC
   and SOC), Partnerships and procurement, Finance and billing, Marketing, Product
   and platform. Each staff member belongs to one or more.
2. Queues route by unit: leads, setup tasks, tickets, incidents, partner tasks, invoices
   and price approvals.
3. Response targets per unit and priority, measured automatically, published monthly
   on the Support page once there is enough data.
4. A one-question satisfaction rating after each resolved ticket.
5. A partner register: status, contacts, agreements, renewal dates and dependent
   products, with renewal reminders.

### U8: Success dashboard

For Admins, with a monthly email to the directors: managed customers and net new;
monthly recurring revenue by pillar compared with hosting-only revenue; leads by
source and conversion; response times and satisfaction; average security score. Targets
are set by Admins and each figure shows on track or behind.

### U9: Free tools and referral partners

1. The free email check result becomes the starting point of a new customer's security
   score.
2. Shareable results pages, with consent.
3. Referral partners (accountants, consultants, IT resellers): sign-up, referral link,
   partner dashboard, commission rate set by Admins, monthly statements, payouts
   recorded by Finance.

### U10: Thebe as a billable product

Thebe plans (Founders, Team, Organisation) in the catalogue and price books, sold and
invoiced through the console. Subscribing creates the customer's Thebe organisation
through its API when available, otherwise a staff task. Thebe keeps its own brand under
Expense management.

### U11: Console experience

First-week onboarding checklist, a named account contact on each customer's home
page, a plan recommender using Thapelo's logic, and a phone-width review of every
console screen in all three markets.

### U12: Connectivity groundwork, hidden

Connect products, bundles with managed services and a request-a-quote flow, all in
draft behind a switch. No public mention until the licence is granted and an Admin
switches it on.

## 3. Order of work

U1 first: it completes the platform for real customers (Openprovider domains, branded
invoices and quotes, bank details). Then U2 with the dark theme. Then U2 to U5, which
carry the positioning and the SOC. Then U6 to U12 in order.

## 4. Deferred to a later prompt: our own platform's infrastructure

Not in this upgrade: off-site encrypted backups of our own platform with tested
restores, multi-server failover for our own servers, and the Botswana data centre
move. Keep the existing backup code working so off-site storage for the platform can be
switched on later with settings. Customer backup and SOC services are not affected by
this deferral.
