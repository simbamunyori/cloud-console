# Fourth Generation Technologies Cloud Console: Phase 1 build brief for Claude Code

Put this file in the repo at `docs/CONSOLE_BRIEF.md`, then tell Claude Code:
"Read docs/CONSOLE_BRIEF.md in full and build Phase 1. Start by showing me your plan."

---

## Your task

Build Phase 1 (Core console) of the Fourth Generation Technologies Cloud Console. The full product spec is at the bottom of this file under "Appendix: Full build spec". Read all of it before planning, but build only what Phase 1 covers.

Before writing code, give me a short plan: folder structure, data model, the billing adapter interface, and the order you will build in. Wait for my go-ahead, then build in milestones and commit at the end of each one.

## What Phase 1 includes

1. **Accounts and organisations.** Sign-up, sign-in, organisation profile, multi-tenant from day one. Every query is scoped to the organisation. Write tests that prove one tenant can never read another tenant's data.
2. **Two-step login, mandatory** for every customer and staff account. Authenticator app codes at minimum; passkeys if they fit cleanly. Sign-in history visible to the customer.
3. **Team roles:** owner, admin, billing only, read only. Enforced on the server, not just hidden in the UI.
4. **Home:** this month's total, next invoice date, services at a glance, items needing attention.
5. **Marketplace:** the launch catalogue from the spec, each product with a plain-language name, description, what is and isn't included, and a monthly price in pula. One-step ordering. Orders go through the connector layer (below), so for now they create a staff task and the customer sees "being set up" with an expected time.
6. **Services pages:** one page per service with status, users or resources, and usage. Read from the billing adapter.
7. **Billing:** invoices, statements, payment methods, purchase order numbers, and a clear breakdown of every invoice line. Read from the billing adapter.
8. **Payments:** a payment adapter with a stand-in. The card gateway is not chosen yet. EFT with invoice reference must work as a manual flow that staff confirm.
9. **Support with AI:** tickets plus an assistant built on the Claude API (Anthropic SDK). Keep the model name in config. The assistant's tools may only read the signed-in customer's own services, invoices and tickets. It never takes an action without the customer confirming, and it hands over to a person with the full conversation and context attached.
10. **Staff admin console:** separate from the customer console. All customers, the provisioning task queue, orders, tickets, and settings for margins per product category and the currency buffer. Margins and buffer are settings, never hard-coded.
11. **Audit log:** every staff action on a customer's account is logged and visible to that customer.

12. **Security area (foundation):** sign-in history, two-step login status and the audit log now. Design the page so the security score, protected devices, SOC alerts, local data copy status and compliance documents from the Cybersecurity strategy section can be added later without restructuring.

## What Phase 1 does NOT include

No real WHMCS connection, no real provisioning (VPS, hosting, domains, Microsoft 365, Google Workspace, Azure), no cloud spend views. Those come in Phases 2 to 4. Build the interfaces so they plug in later without rework.

## The billing adapter (most important design decision)

WHMCS will be the billing and provisioning engine, but it is not bought yet. All billing and provisioning calls go through one `BillingAdapter` interface with two implementations:

- `StubBillingAdapter`: used now. Returns realistic sample clients, products, services, invoices, payments and domains from seed data, and keeps state so ordering, paying and cancelling can be tested end to end.
- `WhmcsBillingAdapter`: an empty shell for Phase 2.

Shape the interface on the published WHMCS API (https://developers.whmcs.com/api/). Check the docs for the exact action names and fields rather than guessing. The actions we expect to need include client lookup and creation, products and pricing, orders, client services and module actions (create, suspend, unsuspend, terminate, upgrade), invoices and payments, and domains (register, renew, transfer, lookup, TLD pricing). Map WHMCS field names in the adapter only; the rest of the console uses our own domain model.

One console organisation maps to one WHMCS client. Store that mapping.

## Connectors

Each product family (productivity, public cloud, servers, web and domains, protection, our software) gets a connector behind one `ProductConnector` interface. For Phase 1, every connector uses the manual fallback: create a staff task, show the customer "being set up" with an expected time, and let staff mark it done.

## Tech stack

Match the Thebe build so code and skills carry across:

- Next.js with TypeScript
- PostgreSQL, multi-tenant, with Prisma
- pg-boss for background jobs
- Claude API for the support assistant
- Docker, with a docker-compose file for local development
- If the Thebe codebase is available to you, reuse its auth, UI components and patterns rather than rebuilding them

## Money

Store money as integers in minor units (thebe for pula, cents for USD) with a currency code on every amount. Never use floats. Pula is the default currency; the model must support others later.

## Design

- Standard: premium, calm, exact, the same bar as Thebe.
- The Fourth Generation Technologies brand refresh is not decided yet. Put every colour, font, radius and spacing value in one theme tokens file so the final brand can be dropped in without touching components.
- The console name and domain are not decided. Keep them in config.
- Mobile first. Every customer journey in the spec must work on a phone.
- UI copy in plain language. No em dashes anywhere in UI text.

## Security

- Secrets (vendor credentials, API keys) only in environment variables for development, structured so a secrets vault can replace them. Never shown in the UI.
- Server-side permission checks on every route and action.
- Rate limiting on sign-in and the AI assistant.
- Nothing is ever deleted without 30 days' notice; use soft deletes for customer data.

## Definition of done for Phase 1

- Every journey that Phase 1 touches works end to end on the stub adapter, on desktop and phone widths.
- Tests cover tenant isolation, role permissions, the billing adapter contract and money calculations.
- Seed script with a realistic demo organisation, services and a few months of invoices.
- README covering setup, environment variables and how to swap the stub adapter for WHMCS.
- A short list of any decisions you had to assume, so I can confirm them.

## When you are unsure

Check the "Open decisions" list in the spec. If a task depends on one of those, build it behind config or an interface and note it, rather than stopping.

---

## Appendix: Full build spec

Sep 26, 2026 · @SimbaraShe Marima

### Overview and business model

Fourth Generation Technologies is the managed cloud partner for businesses and institutions in Southern Africa. It does not compete with Microsoft, Google or AWS; it resells, sets up and runs their services, adds in-country hosting where data must stay local, and sells its own software on top. The Cloud Console is the single place customers buy, manage, pay for and get support on all of it.

Four revenue lines, one customer relationship:

| Line | What we sell | How we earn |
| --- | --- | --- |
| Productivity | Microsoft 365 and Google Workspace seats, setup, migration, support | Licence margin plus monthly support fee |
| Public cloud | Azure first, AWS later | Management fee plus margin on cloud spend |
| Sovereign hosting | VPS, web hosting, email, backups and recovery hosted in Botswana | Monthly subscriptions |
| Our software | Thebe, ILT platforms, future products | SaaS subscriptions |

Goals:

- One account, one monthly invoice in the customer's currency (pula first) for every product
- Self-service for anything a customer can safely do alone: add seats, order a server, renew a domain
- Visibility of cloud spend and waste, which small businesses never get today
- Support answered by AI first, with a person behind it
- Built to the same design standard as Thebe: premium, calm, exact

What we deliberately avoid: building or owning a data centre. In-country hosting runs in colocation with an established Tier III provider.

### Who it's for and the catalogue

Customers: small and mid-size businesses (5 to 250 staff), schools, colleges and universities, professional firms, NGOs, and software companies that need local hosting for their own clients. Launch in Botswana, then Zimbabwe and South Africa, built for any market.

| Category | Products at launch | Later |
| --- | --- | --- |
| Productivity | Microsoft 365 Business Basic, Standard, Premium; Google Workspace Business editions; Workspace for Education once Digicloud approves | Microsoft 365 Copilot, Teams Phone |
| Public cloud | Azure subscriptions under management | AWS (once Select tier is reached) |
| Servers | Managed VPS in Botswana (small, medium, large), dedicated resources on request | GPU servers for private AI |
| Web | Web hosting, WordPress hosting, business email, domains (.bw, .co.bw, .com and others), SSL certificates | Website builder |
| Protection | Backup for Microsoft 365 and Google Workspace, server backup, disaster recovery, local data copy, managed detection and response (see Cybersecurity strategy) | Wider SOC services for larger clients |
| Our software | Thebe | ILT library platforms, private AI knowledge assistant |
| Services | Setup and migration packs, monthly managed support plans, one-off projects | Cloud cost reviews |

Every product has a plain-language name, a fixed monthly price in the customer's currency, and a clear list of what is and isn't included.

### Key customer journeys

Each journey must be completable on a phone, and the first four without speaking to anyone.

1. **Move a business to Microsoft 365 or Google Workspace.** Choose the plan and number of users, verify the domain with guided DNS steps, pay, and receive a migration booking for existing email. Target: order to working mailboxes in under 1 business day.
2. **Add or remove a user.** Change the seat count, see the new monthly total before confirming, done. Removing seats respects each vendor's commitment terms and says so plainly.
3. **Order a server.** Pick a size, operating system and backup option; the server is running within 10 minutes with login details shown once.
4. **Buy a domain and hosting.** Search, buy, and get a site and mailbox live in one flow.
5. **Understand the bill.** One invoice per month; tap any line to see what it is, which users or servers it covers, and how it changed from last month.
6. **Get help.** Ask in the console, by email or WhatsApp; the AI answers from the customer's own setup, and hands over to a person with the full context when needed.
7. **Switch from another provider.** Bring existing Microsoft 365 or Google Workspace subscriptions across, with a checklist and a person assigned.

### Console features

| Area | What it does |
| --- | --- |
| Home | This month's total, next invoice date, services at a glance, anything needing attention (expiring domain, failed backup, unused licences) |
| Marketplace | Every product with plain descriptions, prices in local currency, and one-step ordering |
| Services | One page per service: status, users or resources, settings the customer can safely change, usage |
| Users and licences | Every person in the organisation and which licences they hold, across Microsoft and Google, with unused licences flagged |
| Cloud spend | Spend by service and month, forecast for the month, and savings found (unused seats, oversized servers, idle Azure resources) |
| Billing | Invoices, payment methods, statements, currency, purchase order numbers |
| Support | Tickets, AI assistant, service status, and scheduled maintenance |
| Team | Customer's own admins with roles: owner, admin, billing only, read only |
| Security | Two-step login required, sign-in history, backup status, security recommendations for their Microsoft or Google tenant |

For Fourth Generation Technologies staff, a separate admin console covers all customers, provisioning queues, margin by product, support workload and partner renewals.

**Resellers (later):** IT companies can resell under their own brand through a white-label version of the console.

### Integrations and provisioning

Each product connects through its own connector behind one interface, so a vendor or distributor can be swapped without touching the rest of the console. Where no API is available, the connector creates a task for staff and the customer sees "being set up" with an expected time.

| Product | Connection | Automation level |
| --- | --- | --- |
| Microsoft 365 and Azure | Through the chosen CSP distributor's platform or API | To confirm on distributor calls; manual fallback from day one |
| Google Workspace | Through Digicloud's reseller tools (Google Workspace Reseller API if available to us) | To confirm with Digicloud |
| VPS | Proxmox VE on our colocated servers, through its API or WHMCS module | Fully automated |
| Web hosting and email | DirectAdmin through its WHMCS module | Fully automated |
| Domains | .bw direct with BOCRA through the CoCCA EPP module; all other TLDs through Openprovider's WHMCS module | Fully automated |
| Backups | Backup platform API for Microsoft 365, Google Workspace and servers | Fully automated |
| Thebe and our software | Direct, same account and single sign-on | Fully automated |
| Payments | Local card gateway and EFT, reconciled into Thebe for our own books | Fully automated |

Nightly sync checks every vendor's records against the console (seats, subscriptions, prices) and flags differences before they reach an invoice.

### Billing and provisioning engine (WHMCS hybrid)

Decided 27 September 2026: WHMCS runs in the background as the billing and provisioning engine, and customers only ever see the Fourth Generation Technologies console, built to the Thebe standard.

| Job | Runs in |
| --- | --- |
| Recurring invoices, pro-rating, reminders, suspension | WHMCS |
| Domain registration, transfers and renewals | WHMCS registrar modules |
| Web hosting and email accounts | WHMCS control panel module |
| VPS create, resize, reboot | WHMCS module, or the virtualisation API directly where the module falls short |
| Sign-up, marketplace, services pages, team roles | Console |
| Microsoft 365, Azure and Google Workspace | Console, through the CSP distributor and Digicloud tools |
| Cloud spend views and forecasts | Console |
| AI support | Console, reading WHMCS data through its API |

Rules for the build:

- The console talks to WHMCS only through its API. No changes to WHMCS core files, so upgrades stay safe.
- The WHMCS client area is switched off for customers. The admin area is for staff only, behind VPN and two-step login.
- One customer record: each console account maps to one WHMCS client. Microsoft and Google charges are pushed into WHMCS as invoice lines, so the customer still gets one invoice in pula.
- Every WHMCS invoice and payment flows into Thebe for our own books.
- Because the front end is ours, WHMCS can be swapped out later without customers noticing.

Build order (decided 27 September 2026): the console is built first, and WHMCS is bought only when Phase 2 starts. All billing and provisioning calls go through one billing adapter in the console. Until WHMCS is live, the adapter runs against a test stand-in that returns sample invoices, services and domains, so every screen can be built and tested. The adapter is written to match the calls in the published WHMCS API documentation, so connecting the real system is a swap, not a rebuild.

Cost: the self-hosted Plus licence is US$34.95 a month for up to 250 active clients, and Professional is US$54.95 for up to 500 ([WHMCS 2026 licensing guide](https://assets.whmcs.com/customer-licensing-guide-2026.pdf)). Prices have gone up every year recently ([webhosting.today](https://webhosting.today/2025/10/17/whmcs-2026-price-increase-stability-comes-at-a-higher-cost/)), which is one more reason to keep it behind our own console.

#### Launch software stack

Decided 27 September 2026: WHMCS Plus for billing, DirectAdmin for web hosting and email, Proxmox VE for VPS. Licence cost is about US$64 a month plus about €120 a year per CPU socket for Proxmox updates, before the first customer.

| Component | Choice | Licence cost |
| --- | --- | --- |
| Billing and provisioning | WHMCS Plus, self-hosted | US$34.95/month, up to 250 clients ([source](https://assets.whmcs.com/customer-licensing-guide-2026.pdf)) |
| Web hosting and email panel | DirectAdmin Standard | US$29/month per server, unlimited accounts ([source](https://adminbolt.com/blog/is-directadmin-cheaper-than-cpanel/)) |
| VPS virtualisation | Proxmox VE with Community subscription | Software free; €120 per CPU socket per year for the tested enterprise update channel ([source](https://petronellatech.com/blog/is-proxmox-free-enterprise-licensing-explained-2026/)) |

Why not cPanel: Premier covers 100 accounts at US$69.99/month, then US$0.49 per extra account with no cap, and prices rise every year ([source](https://panelica.com/blog/cpanel-unlimited-accounts-real-cost-2026)). A flat licence protects our margin as we grow.

Standards we launch with:

- Separate machines for customer hosting, VPS hosts, and the console with WHMCS. Billing never shares a server with customer sites.
- A staging copy of WHMCS and DirectAdmin. Every update and module is tested there before it touches production.
- Proxmox runs on the enterprise update channel, not the free testing channel.
- Nightly off-site backups of every server and the WHMCS database, with a test restore every month and the result recorded.
- Staff admin access only through VPN with two-step login, and one named account per person.
- Monitoring with alerts on every server, feeding the public status page at launch.
- All licences bought direct from the vendor or an authorised partner. No cheap third-party or "lifetime" licence sellers.
- Start on WHMCS's built-in DirectAdmin module. Buy a paid extended module only if the console needs a feature the built-in one lacks.

#### Domains

Decided 27 September 2026: Fourth Generation Technologies becomes a BOCRA-accredited .bw registrar, and sells all other TLDs through a wholesale ICANN registrar.

| Domains | Route | Connection to WHMCS |
| --- | --- | --- |
| .bw and its second-level names | Direct registrar, accredited by BOCRA | .bw runs on the CoCCA registry platform, which publishes a WHMCS EPP module ([source](https://www.scribd.com/document/907501647/CoCCAepp-EPP-module-for-WHMCS)) |
| .com, .africa, .co.za and all other TLDs | Wholesale account with Openprovider (fallback: OpenSRS) | Ready-made WHMCS module ([source](https://www.openprovider.com/blog/openprovider-vs-centralnic)) |

BOCRA accreditation: the company must be a Botswana legal person and show it can handle registrations, renewals, transfers, secure data capture, renewal notices and backups ([source](https://nic.net.bw/qualifications-requirements)). The application needs the accreditation form, a signed Registrar Accreditation Agreement and the fees ([source](https://nic.net.bw/)). WHMCS plus the console already covers the systems BOCRA asks for.

Why not ICANN accreditation now: a US$3,500 non-refundable application fee plus US$4,000 a year and per-domain fees ([source](https://dn.org/understanding-registrar-accreditation-fees/), [source](https://www.icann.org/en/announcements/details/icann-accredited-registrars-approve-registrar-level-fees-for-fiscal-year-2026-21-07-2025-en)). Revisit once international domain volume justifies it.

To confirm with BOCRA (registry@bocra.org.bw, +267 395 7755): current accreditation and per-domain fees, and that the registry still runs on CoCCA with EPP access for new registrars.

### Billing, currency and pricing

One invoice per customer per month, in their currency, covering every product. Vendors bill us (Microsoft CSP in Botswana is billed in USD); we carry the currency risk and price for it.

- **Local currency prices:** each USD-cost product has a pula price set monthly from the exchange rate plus a currency buffer. Customers see prices fixed for the month.
- **Pricing rule:** cost plus a set margin per category, reviewed quarterly. Margins and buffer are settings in the admin console, not code.
- **Pro-rating:** mid-month changes are pro-rated and shown as separate lines.
- **Commitments:** annual Microsoft commitments are shown clearly at purchase, with the renewal date and what can and can't be reduced.
- **Payment:** card through a local gateway, EFT with the invoice reference, and debit order for larger customers. Unpaid invoices follow a reminder schedule, then services are suspended after a clear warning; nothing is deleted without 30 days' notice.
- **Tax:** VAT fields switch on per country as registration requires.
- **Our books:** every invoice and payment flows into Thebe, so Fourth Generation Technologies runs on its own product.

### Cybersecurity strategy

Security is a core revenue line for Fourth Generation Technologies, not a later add-on. The company already sells managed security agents and SOC services; the console turns that into a product every customer sees, and data protection duties give regulated customers a reason to buy now.

Positioning (decided 27 September 2026): lead with outcomes every customer wants: one team instead of several suppliers, one invoice in pula, support that answers, and security done for you. Local hosting and the local data copy are supporting points for regulated buyers (schools, clinics, law firms, finance, public bodies), never the headline. In the console UI and all copy, the product is called "Local data copy".

Why now:

- Botswana's Data Protection Act 18 of 2024 is in force. Controllers must report a personal data breach to the Information and Data Protection Commission within 72 hours, and fines reach BWP 50 million or 4% of global turnover.
- The Act is not a blanket data localisation law: personal data may go to countries the Commission deems adequate or under approved safeguards. But the proviso to section 74 says a copy of transferred personal data must remain in Botswana for the period of processing. How strictly this is applied to everyday cloud services such as Microsoft 365 is untested, so we offer a local data copy as an option for organisations that want certainty, and confirm the position with a Botswana data protection lawyer before marketing it.
- The Act expects encryption, tested restoration after incidents and regular testing of security measures.
- Competition is moving: Liquid Intelligent Technologies Botswana launched its Secure360 portfolio in 2026. Our edge is SMB pricing, one console and one invoice in pula.

#### What we sell

| Tier | What the customer gets | How we earn |
| --- | --- | --- |
| Included for everyone | Two-step login enforced, a security score for their account and Microsoft or Google tenant, backup status, plain-language fixes | Nothing directly; it cuts incidents and drives upgrades |
| Secure productivity | Microsoft 365 Business Premium set up to our standard: Defender for Business, Defender for Office 365 Plan 1, Intune and Entra ID P1 | Licence margin plus a monthly management fee per user |
| Local data copy | Daily backup of Microsoft 365 or Google Workspace data kept on our servers in Botswana, with restore on request | Monthly per user |
| Managed detection and response | Our managed security agents on every device and server, monitored by the SOC, with response when something is found | Monthly per device or server |
| Data protection readiness | Record of processing, breach response plan, security measures report and a data protection impact assessment template, with a law firm partner for legal sign-off | One-off fee, then an annual review |
| Incident response retainer | A named team and a 72-hour notification pack when a breach happens | Monthly retainer plus hourly rate on call-out |

Sell it as a ladder: every Microsoft 365 order offers Business Premium by default, every server order includes the security agent option, and customers with data protection duties are offered the readiness pack and the local data copy.

#### In the console

- The Security area shows the security score, devices protected, open alerts, backup and local data copy status, and the customer's compliance documents.
- Alerts from the SOC and the security agents appear as incidents with a clear status and who is handling them.
- A breach checklist starts the 72-hour clock and prepares the Commission notification details for the customer to review.

#### Securing Fourth Generation Technologies itself

As a processor for our customers, a breach at Fourth Generation Technologies is a breach for every customer. On top of the security list in the tech stack section:

- A written incident response plan, tested twice a year, that meets our duty to tell each affected customer promptly so they can meet their 72 hours.
- A data processing agreement in every customer contract.
- An independent penetration test of the console and servers before launch, then yearly.
- Patching and vulnerability scanning on every server, with results in the staff console.
- Our own staff on Business Premium with the same controls we sell.
- ISO 27001 roadmap started at launch, certification once revenue supports it.

### Tech stack, security and hosting

Same foundations as Thebe, so code, components and skills carry across.

| Layer | Choice |
| --- | --- |
| Web app | Next.js (TypeScript) |
| Mobile | Flutter app later, sharing the same API |
| Database | PostgreSQL, multi-tenant |
| Billing and provisioning | WHMCS, self-hosted, behind the console through its API |
| Background jobs | pg-boss: Microsoft and Google provisioning, nightly vendor sync, WHMCS sync |
| AI support | Claude API with tools that read the customer's own services, invoices and tickets |
| Hosting | The console itself runs on our colocated servers in Botswana, with an off-site backup copy |
| Design | Own Fourth Generation Technologies brand system, built to the same standard as Thebe |

Security:

- Two-step login mandatory for every customer and staff account
- Vendor credentials (distributor, registrar, hosting) in a secrets vault; never visible to staff in the interface
- Staff actions on customer tenants logged and visible to the customer
- Least privilege for our access to customer Microsoft and Google tenants, requested per task where the vendor allows it
- Nightly encrypted backups kept 30 days, restore tested monthly
- Security page for customers in plain language; ISO 27001 planned once revenue supports it

### Build phases

The console can be built in about 8 weeks with Claude Code, but what goes live depends on which partner agreements are in place. Build everything with manual fallbacks, then switch on automation as each partner is signed.

| Phase | Scope | Time | Depends on |
| --- | --- | --- | --- |
| 0. Partners and brand | Microsoft Partner Center and CSP application, distributor calls, Digicloud follow-up, colocation quotes, BOCRA .bw registrar application, Openprovider account, Fourth Generation Technologies brand refresh | Weeks 1 to 2 | Nothing; start now |
| 1. Core console | Accounts, team roles, two-step login, marketplace, services pages, billing in pula, payments, admin console, support with AI | Weeks 3 to 5 | Nothing |
| 2. Own infrastructure | Buy and install WHMCS, connect the billing adapter, then VPS, web hosting, email, domains and backups with full automation | Weeks 5 to 6 | Colocation live |
| 3. Productivity | Microsoft 365 and Google Workspace ordering, seat changes, users and licences view | Weeks 6 to 7 | CSP distributor signed; Digicloud approved |
| 4. Cloud spend | Spend views, forecasts, unused licence and idle resource detection, Azure management | Week 8 | CSP distributor signed |
| 5. Launch | Website, public pricing, onboarding, status page, first 10 customers | Week 9 onward | All above |
| 6. Later | AWS, white-label reseller console, mobile app, private AI hosting | After launch | AWS Select tier, demand |

### Questions for partner calls

Ask every distributor the same questions so the answers can be compared side by side.

**Microsoft CSP distributors (for example 4Sight Dynamics Africa and First Distribution)**

1. Do you onboard indirect resellers based in Botswana, and how long does onboarding take?
2. What margin do resellers earn on Microsoft 365 Business plans and on Azure consumption? Are there rebates or incentives on top?
3. Do you offer an API for ordering, changing seats and pulling usage and billing data? If yes, can we see the documentation before signing?
4. If there is no API, what does your portal allow, and can we export invoices and usage automatically?
5. How do you bill us: currency, invoice date, payment terms, and any credit limit for a new reseller?
6. How is Azure consumption billed and when do we see it? Can we set spending alerts per customer?
7. What support do you give us: first-line escalation, response times, and who handles Microsoft support cases?
8. What minimum revenue or commitment do you expect, and what happens if we don't meet the Microsoft FY26 US$1,000 billed revenue requirement in year one?
9. What training, certification support, marketing funds or co-selling do you offer new resellers?
10. Can we migrate existing customers from another provider, and what does that involve?

**Digicloud (Google Workspace)**

1. When will due diligence conclude, and what is outstanding from our side?
2. Once approved, do we get access to reseller ordering tools or an API for seats and subscriptions?
3. What are reseller margins on Business editions, and the path to Workspace for Education eligibility?

**Colocation (BoFiNet, Orange Business Botswana)**

1. Price for a quarter rack and a half rack, including power allowance and bandwidth.
2. Tier rating, uptime commitment and what compensation applies when it is missed.
3. Available connectivity: carriers on site, public IP allocation, DDoS protection.
4. Remote hands: hours, response time and cost.
5. Contract length, setup fees and notice period.

### Open decisions

- [ ] Which CSP distributor, after comparing answers from at least two
- [ ] Colocation provider and rack size
- [x] Virtualisation and hosting control panel software: decided, Proxmox VE and DirectAdmin
- [x] WHMCS licence and modules: decided, Plus with the built-in DirectAdmin module; domains decided, BOCRA accreditation for .bw and Openprovider for all other TLDs
- [ ] Margin per product category and the currency buffer
- [ ] Card payment gateway
- [ ] Console name and domain (verify availability before choosing)
- [ ] Fourth Generation Technologies brand refresh: keep the current identity or rebuild it to the Thebe standard
- [ ] Who on the team gets Microsoft and later AWS certified
- [ ] Which security agent and SOC platform we use today, and whether its API can feed alerts into the console
- [ ] Law firm partner to confirm the local data copy position and sign off data protection readiness packs
- [ ] Security pricing per tier
