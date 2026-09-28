# Change Request 01: markets, positioning and design standard

Phase 1 is built. This file asks for changes and additions on top of it. Where it conflicts with `docs/CONSOLE_BRIEF.md`, this file wins.

Start by reading this file and the current code. Reply with a short plan: what changes, which models and migrations, which pages, and anything in Phase 1 that has to be reworked. Wait for my go-ahead, then build in milestones with a commit after each.

---

## 1. Company name

The company is **Fourth Generation Technologies**. Invoices and legal pages use **Fourth Generation Technologies (Pty) Ltd**. Never write "4th Generations" anywhere: UI, code, comments, seed data, emails or docs. Search the whole repo and fix any occurrence.

## 2. Positioning and copy

The platform must read as an international product, not a Botswana one.

- Headline promise: **Your cloud, handled.**
- What every customer gets: one team instead of several suppliers, one invoice in their own currency, support that answers, and security done for them.
- Stop repeating "pula" in copy. Say "one invoice in your currency" and let the formatted amounts show the currency.
- No country is the headline. Local hosting is a supporting point for regulated buyers only.
- Rename the product "Botswana Copy" to **Local data copy** everywhere: UI labels, product slugs, enum values, seed data, code identifiers and tests. Add a migration for any stored values.
- Copy style: plain, confident, short. No jargon, no exclamation marks, no em dashes.

## 3. Markets and localisation

The market decides currency, prices, catalogue, content and legal pages. Everything else is identical across markets.

| Market | Code | Currency | Locale | Domains highlighted | Data protection law named |
| --- | --- | --- | --- | --- | --- |
| Botswana | bw | BWP | en-BW | .bw, .co.bw | Data Protection Act, 2024 |
| South Africa | za | ZAR | en-ZA | .co.za | Protection of Personal Information Act (POPIA) |
| Zimbabwe | zw | USD | en-ZW | .co.zw | Cyber and Data Protection Act, 2021 |
| International | global | USD | en-US | .com and global names | none |

### Data model

- `Market`: code, name, currency, locale, enabled, default flag, tax settings (rate, inclusive or exclusive display, tax label, registration number shown on invoices), enabled payment methods, support hours, support phone and email, highlighted TLDs, legal page references. All editable in the admin console, every change audited.
- `PriceBook`: one per market. Each product has a price per market. The existing cost, margin and buffer logic produces a **suggested** price per market from the exchange rate; staff approve it. Customers never see live currency conversion.
- `Organisation.billingMarket` and `Organisation.currency`: set at sign-up from the company's billing country, fixed afterwards (changeable only by staff, audited). Invoices always use the account's currency.
- Products can be available in some markets and not others.
- Zimbabwe uses USD now. Do not hard-code that: a market's currency is data, so another currency can be added later without code changes.

### Routing and detection

- Public pages live under `/bw`, `/za`, `/zw` and `/global`, with `hreflang` alternates and canonical URLs, so each market is indexed correctly.
- A visitor landing on `/` is matched to a market from their IP country, read from an edge header (make the header name configurable) with a GeoLite2 lookup as fallback, and anything unmatched goes to `/global`. Search engine crawlers are never redirected.
- A country switcher is always visible in the header and footer. The visitor's choice is stored in a cookie and beats IP detection.
- Signed-in customers always see their own account's market and currency in the console, wherever they are browsing from.

### Formatting and content

- All money goes through one formatter using `Intl.NumberFormat` with the market locale and currency. No currency symbol or code is hard-coded anywhere. Add a lint rule or test that fails on hard-coded `P `, `R `, `BWP`, `ZAR` in UI code.
- Market content lives in config or the database, not in components: hero sub-copy variations, testimonials, support contacts, legal pages, payment methods.
- Legal pages (privacy, terms, data protection) exist per market with clearly marked placeholder text for a lawyer to supply. Do not write legal text.

### Tests

Market detection, the cookie override, crawler handling, price book selection, a customer's fixed currency, formatting for every locale, and availability rules per market.

## 4. Public website

Build the public marketing site in the same app, under the market routes, to the design standard in section 5.

Home page sections, in order:

1. **Hero.** Kicker: MANAGED CLOUD FOR BUSINESS. Headline: Your cloud, handled. Sub: Microsoft 365, Google Workspace, servers, hosting and security, managed for you and billed on one monthly invoice in your currency. Buttons: View plans, Talk to us. Supporting line: One team for everything. Support that answers. Two-step login on every account. On the right, a real screenshot of the console Home page using demo data.
2. **What we take off your plate.** Heading: Less to manage. Less to worry about. Four cards: One team instead of five suppliers; One invoice in your currency; Support that answers; Security done for you.
3. **Services.** Six cards: Microsoft 365 and Google Workspace; Cloud servers; Managed security; Data protection support; Hosting, email and domains; Hosted applications. Each shows "From" plus the market's price from the price book.
4. **The Cloud Console.** Heading: One account. One invoice. One place to get help. Four points: order and change services yourself and see the new total first; every user and licence in one view with unused ones flagged; one invoice a month, every line explained; AI answers in seconds with a person behind them.
5. **Built by people who build software.** We don't just host software. We build it. Our own applications run on our own platform, starting with Thebe.
6. **Who we serve.** Schools, colleges and universities; professional firms; growing businesses; software partners.
7. **Closing.** Tell us what you run today and we'll show you what it looks like done properly. Buttons: Get started, Book a call.
8. **Footer.** Logo, service and company links, market switcher, contact details from the market settings, © Fourth Generation Technologies (Pty) Ltd.

Also build: a Pricing page per market (from the price books), a Security and data protection page (naming the market's law from market settings), and the per-market legal pages.

## 5. Design standard

The bar: anyone who opens the site or console should assume a global software company built it. Match the polish and clarity of Microsoft, Apple, IBM and GoDaddy. Do not copy their designs, layouts, fonts or assets.

- Every colour, size, radius and shadow comes from the brand tokens in `brand/`. No one-off values.
- One type scale, one 4 and 8 px spacing grid, one icon set, one component library used everywhere.
- Every screen has designed loading, empty and error states. Skeletons instead of spinners. No layout shift.
- Motion is short and quiet (150 to 250 ms) and respects reduced-motion settings.
- Light and dark themes. WCAG 2.2 AA contrast, full keyboard use, visible focus.
- Performance at Google's good thresholds: largest contentful paint 2.5 s or less, interaction to next paint 200 ms or less, cumulative layout shift under 0.1.
- Imagery is real product screens or purpose-made illustration. No generic stock photos.

Deliverables for this section:

- A design audit of every Phase 1 screen against this list, with the fixes made.
- Automated checks in CI: accessibility (axe) on every page, and Lighthouse on the public pages with performance, accessibility and SEO targets that fail the build if missed.
- Screenshots of every page at 390, 768, 1280 and 1440 px wide, light and dark, saved under `docs/screenshots/` so I can review them.

## 6. Carried over from the Phase 1 go-ahead

Confirm each of these is in place, and add any that are missing:

- Email adapter (SMTP in production, a local test inbox in docker-compose).
- The assistant sends the model only what a question needs, never bank details, passwords or keys; treats ticket text and customer data as data, never instructions; logs every tool call to the audit log. The privacy page says the assistant uses an AI service hosted outside the customer's country.
- Security headers (content security policy, secure httpOnly cookies with SameSite), a dependency audit in CI, and an optional IP allowlist for `/admin`.
- EFT bank details per market come from market settings, not code.
- `docs/shared-with-thebe.md` lists every module copied from Thebe.

## Definition of done

- All four markets work end to end with demo price books. Botswana is enabled; South Africa, Zimbabwe and International can be switched on from the admin console.
- No hard-coded currencies, no "Botswana Copy", no "4th Generations" anywhere in the repo.
- CI passes, including the accessibility and Lighthouse checks.
- Screenshots are in `docs/screenshots/`.
- A short list of any assumptions made, in `docs/decisions.md`.
