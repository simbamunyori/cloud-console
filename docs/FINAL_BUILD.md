# Fourth Generation Technologies: final build and deployment

This is the one document for finishing the platform. It replaces and combines Change Requests 02 and 03 and adds everything agreed since. Where it conflicts with any earlier document, this file wins.

The approved design is in `docs/design/`: `home-desktop.html` (1440 px), `home-phone.html` (390 px) and `logos/`. The design is final. Match its layout, copy, spacing and order exactly, rebuilt with our own components and tokens. Do not redesign, restyle or reword anything in it.

---

## How we work (read first)

- Work through the milestones in order. **Milestone 1 (production deployment) happens today, before anything else.**
- One pull request per milestone. Each PR must pass all checks (tests, type checks, accessibility, Lighthouse) before you ask for review. Do not open a PR that is not ready to merge.
- In each PR description, give me a short list of what changed and anything I must do by hand. Keep hand steps to the minimum, and give them as exact commands or exact clicks.
- After Milestone 1, **every merge to main deploys to production automatically.** My only job per milestone is: review, merge.
- Do not ask me design or copy questions: the answers are in this document and the design files. Ask only when something is genuinely missing, and batch questions into one message.

---

## Rules that apply everywhere

- The company is **Fourth Generation Technologies**. Legal pages and invoices use **Fourth Generation Technologies (Pty) Ltd**, registration BW00001816431. Never write "4th Generations".
- Copy: plain, confident, short. No exclamation marks, no em dashes, no jargon.
- Design system: Poppins; one action colour, blue #2F6BFF; navy #0B1F3A; neutrals for everything else; 2 px corners on buttons, 4 px on panels; 1 px lines instead of shadows (shadows only on floating elements); header logo 46 px desktop, 38 px phone; navigation 13 px light (300); top strip 11 px light. Plain white hero, no gradients or patterns.
- Thebe appears in its own brand: Geist, teal #0F6B63, ink #0D1B2A, its own logo.
- **Nothing empty reaches the public site.** Any block without approved content hides itself: no placeholders, dashed boxes, "[X]" values or "coming soon".
- Real company figures (confirmed): since 2014; 250+ businesses we look after; 1,800+ mailboxes we look after. All figures come from the CMS.
- Security and privacy rules from earlier change requests still apply: two-step login, audit log, secrets only in environment variables, no customer data sent to AI beyond what a task needs.

---

## Milestone 1: production deployment (today)

Deploy the current main branch to production today, then set up automatic deployment on every merge.

**Server:** the existing Contabo VPS (Ubuntu 24.04) that runs WHMCS. Apache already serves billing.fourthgeneration.technology on ports 80 and 443 with certbot.

1. Run the console and its Postgres with Docker Compose. Apache stays on 80 and 443 and reverse-proxies the console; do not install Caddy on this server. HTTPS with certbot.
2. Address for now: **console.fourthgeneration.technology** (customer console and public site). The main domain, fourthgeneration.technology, switches over in Milestone 10, once content is approved.
3. Production settings: `BILLING_ADAPTER=whmcs`, `WHMCS_ENVIRONMENT=production`, demo seed off, start-up refuses placeholder values. Set the WHMCS sync addon's Allowed IPs and the WHMCS API access to this server's own IP only, and remove the test ranges.
4. Automatic deployment: a GitHub Actions workflow that, on every push to main after CI passes, connects to the server over SSH with a dedicated deploy user, pulls, builds, runs database migrations, restarts, checks a health endpoint, and rolls back automatically if the health check fails.
5. Nightly backups of the console database and uploaded media to off-site storage, with one test restore before we call this milestone done.
6. Create my Admin account.

**Give me, in one message, exactly what I must do by hand:** the DNS record to add, the commands to paste on the server (installing Docker, creating the deploy user and key, the `.env` file with the values I must fill clearly marked), and the GitHub secrets to add. Then confirm the site is live.

---

## Milestone 2: site editor and catalogue management

1. If Payload CMS needs a newer Next.js, upgrade Next.js first inside this milestone, with the full test suite and fresh screenshots.
2. **Payload CMS** inside the app, content in our Postgres (its own schema). Staff sign in with their normal staff accounts and two-step login; no separate editor passwords.
3. Roles: Editor (drafts) and Publisher (publishes). Each staff account gets its own role; Admins can always publish. Every publish is written to the staff audit log.
4. Page builder: blocks that staff add, edit, remove and drag to reorder: hero, feature cards, services grid, pricing (reads price books), text, image and text, FAQ, testimonials, logo strip, call to action, domain search, insights strip.
5. Guardrails: blocks use brand tokens only; editors choose content and options, never colours, fonts or code. Prices always come live from the price books.
6. Live preview at desktop and phone widths, drafts, scheduled publishing, version history with one-click restore.
7. Per market content (bw, za, zw, global) with fallback to the default market.
8. Everything public is editable: pages, navigation and mega menus, footer, contact details, social links, legal pages, SEO titles, descriptions and share images.
9. Media library with automatic resizing and required alt text. Images stored on the server disk behind a storage adapter, included in nightly backups.
10. Legal pages keep the "DRAFT FOR LEGAL REVIEW" banner until a Publisher ticks "Approved by legal" (audited).
11. **Catalogue management:** product families and products with name, summary, included, not included, category, setup time, minimum term, availability per market, and **fulfilment type**: automatic (connector), manual (staff task) or request a quote. **Status**: draft (hidden everywhere), internal (staff only) or live. Prices stay in the price books with the approval flow, and sync to WHMCS.
12. **Quotes and subscriptions:** anyone can request a quote through a short public form (name, company, email, phone, country, need), protected by rate limiting and a honeypot. It creates a lead in the staff console. Staff send a quote; the customer needs an account only to accept it. An accepted quote becomes an order, and recurring items become subscriptions managed in the console like any other service (renewals, changes, cancellation, invoices).
13. Add a **Connectivity** family (request a quote, status draft). Nothing about internet, fibre or wireless may appear publicly until I publish it.
14. Migrate all current public-site copy and the legal pages in `content/legal/` into the CMS, so the site looks identical afterwards.

---

## Milestone 3: final home page, mega menus, footer and insights

Build the home page exactly as `docs/design/home-desktop.html` and `home-phone.html`, in this order:

1. **Top strip:** live status (from monitoring; never "All systems normal" during an open incident), country and currency selector, Sign in.
2. **Header:** logo; Domains, Email, Websites, Security, Hosting and backup, Expense management, Plans; Support; Get started.
3. **Hero:** kicker MANAGED CLOUD FOR BUSINESS; "Everything your business needs online. Handled."; "Domains, email, websites, security, cloud hosting, backup and disaster recovery. Set up by our team, looked after every day, and billed on one invoice in your currency."; Get started and Talk to our team. The console under it is **the real console Home component rendered with demo data**, not an image.
4. **Domain search** working like a store: available, taken, alternatives, yearly price from the price book, Add to cart.
5. **Proof:** numbers, partner and accreditation badges, client logos (Milestone 4).
6. **What we look after:** 01 Domains, 02 Email and Microsoft 365, 03 Websites and stores, 04 Security, 05 Cloud hosting and backup, 06 Expense management.
7. **Email and Microsoft 365:** laptop and phone showing the same customer signature (the Kgale Logistics demo in its own brand, never ours) and the Microsoft partner badge.
8. **Websites:** the Mothibi Attorneys example site in a browser frame, Build it yourself, We build it for you.
9. **Security panel:** the real console Security component with demo data.
10. **Thebe section** in Thebe's brand: "Every request approved properly. Every payment accounted for." Thebe is expense and purchase management for whole organisations: staff raise requests, approval workflows route them by team, amount and budget, and the business sees what is spent, committed and left. Six features: requests from anywhere; approval workflows; live budgets and spending; Ask Thebe; connects to Sage (including Pastel), QuickBooks and Xero; full audit trail. The accounting feature is a CMS toggle, hidden until those integrations exist in Thebe. Buttons: Try Thebe, Learn more about Thebe (link from config).
11. **Plans:** comparison table (Start, Grow recommended, Protect) with rows including Disaster recovery and Daily backup, price per business plus per user from the price books, live estimate with a user stepper, licence footnote. Phone: compact comparison table plus sticky plan bar.
12. **Free tools comparison.**
13. **Team:** photos, names and roles from the CMS; support hours; median first reply; the NSMC line for on-site IT and infrastructure.
14. **Insights strip:** the three latest published insights (Milestone 7), with tag, reading time, title, summary, Read, and the related product.
15. **FAQ** (eight questions, linking to the help centre), closing banner.
16. **Footer**, exactly as designed: newsletter sign-up ("Insights in your inbox, once a month", with consent and double opt-in); brand block with tagline, since 2014, address, phone, email and social links (LinkedIn, Facebook, WhatsApp, from the CMS, hidden if empty); four link columns (What we look after, Company, Trust, Support); a row of approved partner badges; bottom bar with copyright and registration number, Privacy, Terms, Refunds, live status and the country selector.

**Floating Thapelo** on every public page (Milestone 6).

### Mega menus

Every header item except Plans opens a full-width mega menu on hover, click or keyboard focus. Grouped links each have a one-line description, plus a feature area. Menu contents come from the CMS; links to products that are not live stay hidden. On phones the same menus open as expandable lists.

| Menu | Links | Feature area |
| --- | --- | --- |
| Domains | Register a domain; Transfer a domain; Domain endings (.bw, .co.bw, .com, .africa, .co.za); DNS management; Free security certificates | Working domain search box |
| Email | Microsoft 365; Google Workspace; Business email; Email security; Signatures; Move your existing email; Email backup | Microsoft partner badge |
| Websites | Website builder; Online stores; We build it for you; WordPress hosting; Templates by industry | Mothibi Attorneys preview |
| Security | Security score; Device protection and EDR; Email security; Managed firewalls; Vulnerability scanning; Data protection support; Compliance archiving | Free security check (Milestone 8) |
| Hosting and backup | Cloud servers; Hosted applications (Koha, Odoo, WordPress); Backup; Disaster recovery; Local data copy (hidden until live) | Short line on tested backups |
| Expense management | Requests from anywhere; approval workflows; live budgets; Ask Thebe; accounting connections; audit trail | Thebe screen, Try Thebe, Book a demo |
| Support | Help centre; Contact us; Service status; Talk to Thapelo | Support hours and phone |

---

## Milestone 4: proof content managed in the admin area

Editable, drag-to-reorder, per market; each block hides itself when empty or not approved.

| Collection | Fields | Shows only when |
| --- | --- | --- |
| Partners and accreditations | name, official logo, link, badge wording, approval evidence, approved to display, order | approved to display is ticked |
| Client logos | company, logo, website, permission obtained, permission date, order | permission obtained |
| Proof numbers | value, label, source note, order, visible | visible |
| Team members | photo, name, role, order, visible | photo present and visible |
| Testimonials and case studies | quote, name, role, company, logo, result, permission, order | permission |
| Website showcase | client, screenshot, industry, URL, permission | permission |
| Announcement bar | text, link, start and end date | within the dates |
| Support details | hours, phone, email, WhatsApp number | always |

Calculated automatically: **median first reply** from support tickets over the last 90 days (shown only with at least 30 tickets); **status** from monitoring.

---

## Milestone 5: sign in with Microsoft, Google and passkeys

1. **Sign in with Microsoft** (Microsoft Entra ID, any work or personal account) and **Sign in with Google**, on sign-in and sign-up, for customers.
2. An existing account links to Microsoft or Google by verified email, after the customer confirms with their current sign-in.
3. **Passkeys** (fingerprint or face on the device) as a sign-in option and as the second step.
4. Email, password and authenticator codes remain available, with recovery codes.
5. **Step-up check for sensitive actions**: paying, changing payment methods, managing users and roles, cancelling services and changing security settings require a passkey or authenticator code in the last 15 minutes, whichever way the person signed in.
6. No SMS codes.
7. Staff sign in with Microsoft (our tenant) plus a passkey or authenticator code.

---

## Milestone 6: Thapelo, the AI sales assistant

- Floating on every public page: an open panel on desktop, a bubble on phone ("Questions? Ask Thapelo"). It says clearly that it is an AI assistant.
- It answers only from the catalogue, the market's price books, the FAQ, the help centre and published insights. It checks domain availability, recommends a plan from what the visitor describes, starts sign-up or an order, and captures a lead with consent.
- **Talk to a person** is always one tap away: it creates a lead with the full conversation and notifies staff. It can also offer **Book a call with a pre-sales engineer** (Milestone 8).
- It never invents a price, discount, feature, partner status or promise; if it does not know, it says so and offers a person. It has no access to customer accounts. It is rate limited, and conversation text is always treated as data, never as instructions.
- Greeting, quick replies, extra knowledge and on or off per market are managed in the admin area. Conversations are stored and deleted in line with the Privacy Notice.

---

## Milestone 7: product launch kit and insights

When a product's status changes to **live**, the system prepares a launch kit automatically, and nothing is published without a Publisher's approval.

1. **Product page:** built from the catalogue fields in the standard product page layout: what it is, who it is for, what is included, price from the price book, FAQ, and order or request-a-quote buttons.
2. **Insight article draft:** an AI-written draft in our voice, explaining why we offer this product, the problem it solves, and how it fits with our other services, linked to the product page. Staff edit and publish it. Published insights appear on the Insights page, the home page strip and Thapelo's knowledge.
3. **LinkedIn post draft:** copy-ready text plus a branded share image, linking to the product page. Staff copy and post it. Direct posting to the company page comes later, once LinkedIn API access is approved.
4. **Tracked links:** every link in the kit carries campaign tags, so we can see which posts and ads bring visitors, leads and sales.
5. **Insights section:** an Insights page (not in the main navigation; linked from the home page strip, footer and mega menus), with topics such as Resilience, Compliance, Email security and Productivity. Each article ends with the related product and a call to action.
6. **Monthly newsletter:** built from recent insights, sent to subscribers who gave consent, with one-click unsubscribe.

---

## Milestone 8: lead magnets and an automated sales funnel

Free, useful tools that bring businesses in, capture leads with consent and move them to sign-up without manual work:

1. **Free domain search** (already on the home page).
2. **Free email security check:** a visitor enters their domain and gets a plain-language report from public DNS only (MX, SPF, DKIM for common selectors, DMARC, website certificate, domain expiry), with fixes and the matching products. No intrusive scanning.
3. **Microsoft 365 and Google Workspace cost calculator:** users and needs in, a recommended plan and monthly total out, from the price books.
4. **Data Protection Act readiness checklist:** a short questionnaire giving a score and next steps, with a downloadable summary after sign-up.
5. **Leads:** every tool, Thapelo chat, quote request and newsletter sign-up creates or updates a lead in the staff console, with its source, the tool used and campaign tags.
6. **Follow-up emails:** a short, useful email sequence per lead source, stopping when they buy or unsubscribe.
7. **Book a pre-sales engineer:** a booking page showing staff availability, sending calendar invites to both sides, linked from Thapelo, product pages and the tools.
8. Sign-up and first order stay fully self-service, from a tool result straight to checkout.

---

## Milestone 9: catalogue additions

Add these as products, each with the right fulfilment type and status:

- **Disaster recovery** (Cloud hosting and backup): internal until its service description, targets and price are set.
- **Compliance archiving** for Microsoft 365 and Google Workspace (Security): cloud service sold by Fourth Generation Technologies, draft until the partner is signed. Enterprise, on-site compliance projects are referred to NSMC through a request-a-quote form.
- **Fourth Generation Signatures** (Email): draft until built.
- **Website builder** (Websites): draft until the builder partner is live.

New partner products follow the same path: I sign a partner, a staff member adds the product in the admin area, sets its fulfilment type and price, and sets it live. The launch kit (Milestone 7) then does the rest.

---

## Milestone 9b: existing client migration (before launch)

Bring existing clients over from Odoo before launch, without changing what they pay or when they pay it.

1. **Import tool** from the Odoo exports (customers, contacts, active services, domains, unpaid invoices), with a dry-run report I approve before anything is written.
2. **Legacy prices:** each migrated service maps to the closest catalogue product but keeps the customer's existing price as a per-service recurring price, flagged "legacy price", with an optional review date. Price book changes never alter legacy prices. Services with no matching product go into a hidden "Legacy services" product group. New customers always use the price books.
3. **Opening balances** for unpaid invoices, and next due dates carried over so nobody is billed early, late or twice.
4. **Services hosted elsewhere** (Contabo, SiteGround, other): each service records its location (provider, server or account, notes). Suspend, unsuspend and cancel create staff tasks with reminders instead of automatic actions, and the customer sees the service like any other. A "move to our servers" action switches it to automatic management later.
5. **Welcome emails** inviting migrated customers to the console, sent only when I choose the cutover date.

---

## Milestone 10: launch

1. Final checks: test purchases end to end (domain, Microsoft 365 fulfilled by hand, bank transfer), accessibility and Lighthouse checks, screenshots at 390 and 1440 px, light and dark.
2. Confirm every public block with placeholder or unapproved content is hidden.
3. Point **fourthgeneration.technology** and **www** to the site (give me the DNS changes), keep console.fourthgeneration.technology for signed-in customers, and redirect old site paths to their new equivalents.
4. Give me a one-page handover: where everything is managed in the admin area, and who does what day to day.

---

## Already in place (do not redo)

Phase 1 console, markets and localisation, the billing adapter and WHMCS sync (live tested, 21 of 21), legal pages in `content/legal/`, the brand pack in `brand/`, and the WHMCS setup guide in `docs/whmcs-setup.md`. DPO card payments stay in PR #3 until the merchant account is approved.
