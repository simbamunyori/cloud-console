# Cloud Console

The customer and staff console for Fourth Generation Technologies, and the
public website: buy and manage cloud services, see and pay invoices, get
support. Phase 1 of the plan in `docs/CONSOLE_BRIEF.md`, with Change
Request 01 (`docs/CHANGE_REQUEST_01.md`): markets, price books, the public
site and the design standard.

- The public site lives under each market: `/bw`, `/za`, `/zw`, `/global`.
  `/` sends visitors to theirs.
- Customers sign in at `/sign-in` and use the console at `/app`. "Forgot password?" emails a single-use link that works for 30 minutes; afterwards they sign in with the new password and their authenticator code as usual.
- Staff sign in at `/admin`, with their own accounts and session cookie.
- Every billing and provisioning call goes through `BillingAdapter`. Until
  WHMCS is bought, a stub billing engine keeps its state in PostgreSQL, so
  every journey works end to end.

Stack: Next.js 15 (App Router) with TypeScript, PostgreSQL 16 through
Prisma, pg-boss for background jobs, Tailwind 4, Vitest, Docker.

## Run it locally

You need Node 22 and Docker (or PostgreSQL 16 of your own).

```sh
cp .env.example .env
# Fill in TOTP_ENCRYPTION_KEY and PAYLOAD_SECRET:  openssl rand -base64 32
docker compose up -d          # PostgreSQL, and Mailpit to catch email
npm install
npm run db:migrate            # Prisma, then the website editor's; `npm run db:dev` while changing the schema
npm run db:seed               # demo organisation, staff accounts, catalogue
npm run dev                   # http://localhost:3000, the site; /app, the console; /admin/content, the website editor
```

Every email the console sends lands in Mailpit at http://localhost:8025.

### Demo accounts (from the seed)

The password for all of them is `demo-password-2026`. You set up an
authenticator app at first sign-in.

| Where | Email | Role |
| --- | --- | --- |
| `/sign-in` | demo@kgalehill.co.bw | Owner of Kgale Hill Logistics |
| `/sign-in` | kabo@, accounts@, lesego@kgalehill.co.bw | Admin, Billing, Read only |
| `/admin` | staff@example.co.bw | Staff admin |
| `/admin` | finance@, setup@, support@example.co.bw | Finance, Provisioning, Support |

The demo organisation has six months of invoices, a server being set up, a
bank transfer waiting for finance to confirm and a support ticket. The seed
is safe to run again: it leaves an existing demo organisation alone. It
refuses to run in production unless `SEED_DEMO=yes`, and a production server
started on demo data refuses to start unless `ALLOW_PLACEHOLDERS=yes`.

### Test payments

With `PAYMENT_ADAPTER=stub`, "Pay by card" goes to a test payment page at
`/stub-gateway/...`. No card is charged. Use any future expiry date and any
three digits:

| Card | Result |
| --- | --- |
| 4242 4242 4242 4242 | Pays |
| 4000 0000 0000 0002 | Declined |
| 4000 0000 0000 9995 | Declined, not enough funds |

## Checks

```sh
npm run check     # lint, typecheck, UI copy check, all tests
npm run build
```

The tests are integration tests against a real PostgreSQL, using
`DATABASE_URL` and `TOTP_ENCRYPTION_KEY` from the environment (load `.env`
first, e.g. `set -a; . ./.env; set +a`). They create their own
organisations and leave them behind, so point them at a separate database
to keep your development data tidy:

```sh
createdb -h localhost -U console console_test
export DATABASE_URL=postgresql://console:console@localhost:5432/console_test
npm run db:migrate && npm test
```

The copy check (`scripts/check-copy.ts`) fails on an em dash anywhere in
the source or docs, and on the company's old name. Two tests guard the
design: `tests/no-hardcoded-currency.test.ts` fails on currency symbols or
codes written by hand in UI code, and `tests/design-tokens.test.ts` on
hex colours, one-off Tailwind values or durations outside
`src/config/theme/tokens.json`.

### Browser checks and screenshots

These run against a production build with the demo seed. Take them from a
freshly seeded database, or test data shows up:

```sh
npm run build && ALLOW_PLACEHOLDERS=yes npm start &   # http://localhost:3000; demo data needs ALLOW_PLACEHOLDERS
npm run test:a11y                                  # axe on every page, light and dark, and the site's routing
npx lhci autorun                                   # Lighthouse budgets on the public pages
npm run screenshots                                # every page, 4 widths, 2 themes, into screenshots-full/
npm run screenshots -- --commit                    # also the 390 and 1440 px set into docs/screenshots/
npm run screenshots:hero                           # the site's console pictures: hero, phone close-up, invoice
```

Set `BASE_URL` if the console isn't on port 3000. Browsers come from
Playwright (`npx playwright install chromium`); for Lighthouse, point
`CHROME_PATH` at a Chrome or Chromium. Pages to check are listed in
`e2e/support/pages.ts`; add new pages there.

CI (`.github/workflows/ci.yml`) runs `npm audit` on production
dependencies, checks the migrations match the schema, seeds twice, runs
lint, typecheck, the copy check, the tests and a production build, and
builds the Docker image. A second job starts the built console and runs
axe (WCAG 2.2 AA) on every page in both themes, Lighthouse on the public
pages (performance 90, accessibility 100, SEO 100, best practices 95,
LCP 2.5 s, CLS 0.1, TBT 200 ms), and uploads every screenshot as the
`screenshots` artifact. `docs/design-audit.md` records the design audit.

## Environment variables

`.env.example` lists them all, with comments. Settings are read and
checked in `src/server/env.ts`; secrets are read only through
`src/server/secrets.ts`, so a vault can replace the environment later
without touching anything else. Secrets are never logged, never shown in
the UI and never sent to the assistant.

| Variable | Needed | What it does |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `PAYLOAD_SECRET` | Yes | Secret for the website editor's own tokens (staff never get an editor password) |
| `MEDIA_STORAGE` | No | Where uploaded images are stored; only `disk` for now |
| `MEDIA_DIR` | No | Where images uploaded in the website editor are kept; defaults to `media/` |
| `BACKUP_PASSPHRASE` | Production | Encrypts the nightly backups; keep a copy off the server |
| `BACKUP_AT`, `BACKUP_KEEP_DAYS` | No | When the nightly backup runs (UTC, default 23:00) and how many days are kept (default 30) |
| `APP_URL` | Yes in production | Public address, used in email links |
| `CONSOLE_NAME` | No | What customers see the console called (default "Cloud Console") |
| `TOTP_ENCRYPTION_KEY` | Yes, secret | 32 random bytes, base64. Encrypts authenticator secrets. Losing it means everyone sets up their authenticator again |
| `SMTP_URL` | Yes in production | Outgoing mail, e.g. `smtps://user:pass@smtp.example.com:465`. Mailpit in development |
| `MAIL_FROM` | No | Sender address |
| `BILLING_ADAPTER` | No | `stub` (default) or `whmcs` |
| `WHMCS_API_URL` | With WHMCS | WHMCS API address |
| `WHMCS_API_IDENTIFIER`, `WHMCS_API_SECRET` | With WHMCS, secret | API credentials (docs/whmcs-setup.md) |
| `WHMCS_ACCESS_KEY` | Optional, secret | If WHMCS requires an API access key |
| `WHMCS_ENVIRONMENT` | With WHMCS | `test` or `production`. Production refuses the write tests and sends domain orders to the registrar |
| `WHMCS_SYNC_SECRET` | For the price sync, secret | Shared with the sync addon in WHMCS |
| `WHMCS_SYNC_URL` | No | The sync addon's address, if not beside `WHMCS_API_URL` |
| `PAYMENT_ADAPTER` | No | `stub` only, until the card gateway is chosen |
| `ANTHROPIC_API_KEY` | Optional, secret | Switches the support assistant and Thapelo, the website assistant, on, and writes launch kit drafts. Without it, the assistant page offers a ticket instead, Thapelo stays hidden and launch kits get plain drafts from the catalogue |
| `ANTHROPIC_MODEL` | No | Model the assistant uses (default `claude-sonnet-5`) |
| `SALES_ASSISTANT_DEMO` | Demo and CI only | `yes` gives Thapelo, the website assistant, scripted answers. Refused in production |
| `TOOLS_DEMO` | Demo and CI only | `yes` makes the free email security check answer from fixed records (`secure.example` passes) instead of public DNS. Refused in production |
| `GEO_COUNTRY_HEADER` | No | Header the CDN puts the visitor's country in (default `cf-ipcountry`, Cloudflare's) |
| `GEOLITE2_DB_PATH` | No | Path to a MaxMind GeoLite2 Country `.mmdb` file, for country detection without a CDN header |
| `ADMIN_IP_ALLOWLIST` | Recommended in production | Comma-separated addresses or IPv4 ranges (CIDR) allowed to open `/admin`. Empty allows any address |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Recommended, secret | Sign in with Microsoft (docs/sign-in-setup.md). The button hides while either is unset |
| `MICROSOFT_STAFF_TENANT_ID` | Recommended | Our Microsoft 365 tenant. Staff sign in with Microsoft only from it; unset keeps staff on passwords |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Recommended, secret | Sign in with Google, for customers (docs/sign-in-setup.md) |
| `STAFF_PASSWORD_SIGN_IN` | No | `yes` keeps staff passwords working after Microsoft sign-in is set up, as a way in if Microsoft is down |
| `CONSOLE_JOBS` | No | `off` stops background jobs on this server, for extra app servers |
| `POSTGRES_PASSWORD`, `DOMAIN` | Production compose | Database password, and the domain Caddy gets a certificate for |
| `SEED_DEMO` | No | `yes` lets the seed run in production. Don't |
| `STATUS_PAGE_URL` | No | An outside service status page. While unset, the site's status links go to its own `/status` page, which staff run at `/admin/status` |
| `THEBE_TRY_URL`, `THEBE_URL`, `THEBE_DEMO_URL` | Optional | Override Thebe's addresses. Unset, Learn more and Try Thebe go to https://www.thebe.africa (Try Thebe can be changed in the site editor under Website, Thebe links), and Book a demo goes to our pre-sales booking page while anyone takes bookings |
| `NSMC_URL` | Optional | Overrides NSMC's website for the on-site IT line on the home page. Unset means https://www.nsmc.africa |
| `SUPPORT_EMAIL` | Production set-up | Filled into every market still on the development support address when a release starts |
| `OFFSITE_S3_ENDPOINT`, `OFFSITE_S3_BUCKET`, `OFFSITE_S3_ACCESS_KEY_ID`, `OFFSITE_S3_SECRET_ACCESS_KEY`, `OFFSITE_S3_PROVIDER` | Production | Where the nightly backups are copied off the server (Cloudflare R2 or any S3-compatible storage) |
| `ALLOW_PLACEHOLDERS` | Demo servers only | In production the server refuses to start while a development placeholder is set: no real `SMTP_URL`, a `support@localhost` market email, the demo bank details, seeded exchange rates, the demo accounts, or a localhost `APP_URL` or `MAIL_FROM`. It lists each one and where to fix it. `yes` starts anyway with a warning, for demo and CI servers. CI proves the refusal on every run with `scripts/check-placeholder-refusal.sh` |

The company name and legal name live in `src/config/app.ts`. Support
contacts, bank details for EFT, tax and legal page links are per market,
edited at `/admin/markets`. The site's words are in `src/config/site.ts`. Every colour, font, radius and spacing value lives in
`src/config/theme/tokens.json`, seeded from `brand/`.

## Deploy

Production runs on the Contabo server beside WHMCS, behind its Apache, and
every push to main that passes CI deploys itself. docs/deploy.md has the
set-up, how a deploy and its rollback work, backups and restores.

For any other server, `docker compose -p console -f docker-compose.prod.yml --profile caddy up -d`
runs the app, PostgreSQL, the backup and Caddy (automatic HTTPS for `DOMAIN`).
The app applies database migrations on start. Background jobs (email
delivery, the stub's nightly billing run, default PO numbers) run inside
the app through pg-boss, in the same database.

### Behind Cloudflare

The site picks a visitor's market from their country. Behind Cloudflare
nothing needs setting up: Cloudflare adds `cf-ipcountry` to every request
(check that IP Geolocation is on under Network in the Cloudflare
dashboard), and `GEO_COUNTRY_HEADER` reads it. Proxy the
domain through Cloudflare (orange cloud) with SSL mode "Full (strict)",
since Caddy has its own certificate.

Without Cloudflare, either set `GEO_COUNTRY_HEADER` to the header your
CDN or load balancer uses, or download the free GeoLite2 Country database
from MaxMind (it needs an account and a licence key, and updates twice a
week), mount it into the app container and set `GEOLITE2_DB_PATH`. With
neither, everyone lands on the default market and can switch.

## Markets and prices

- **Switching a market on:** `/admin/markets`, as a staff admin. Fill in
  its support contacts, bank details if it takes bank transfer, and tax,
  and approve its prices (below), then switch it on. Its site and sign-up
  open at once. Its currency, locale and countries come from the market
  row, so a new currency needs no code.
- **Prices:** `/admin/pricing` has a tab per market. Enter each month's
  exchange rates per currency pair, then approve the suggested prices (one
  at a time, at a different amount, or all at once). Approved prices apply
  from next month; customers never see a suggestion. Products and domain
  endings are offered per market there too.
- **Catalogue:** `/admin/catalogue`, as a staff admin. Families (each
  fulfilled by one connector), categories and products. A new product is
  a draft: approve its prices on the Pricing page, preview it as a
  customer in any market would see it, then make it internal (staff and
  our test organisations, set on a customer's page) or live. Draft and
  internal products never reach the public site, the marketplace, search
  or the assistant. Connectivity is a draft family sold only by quote,
  with no products yet. The seed only adds what is missing, so staff edits
  stay. Every change is in the staff audit log with before and after.
- **Quotes:** anyone can ask at `/<market>/quote` (no account), or in the
  console at `/app/quotes/new`; products sold by quote link there. Staff
  price requests at `/admin/quotes` (Support and Admin): monthly and
  one-off lines, the product it is ordered as, and a date it holds until,
  then send it. The email links to `/quote/<token>`, where anyone can read
  or decline it; accepting needs an account and places an ordinary order
  at the quoted price, with the one-off lines on its first invoice. The
  form has a hidden field for bots and a limit of 5 requests an hour per
  address.
- **Waiting list:** people from countries with no market that is on can
  leave their details at sign-up; staff see them at `/admin/waitlist`.

`docs/decisions.md` lists what the console assumes and decided.

## Swapping the stub for WHMCS

The full mapping, method by method, is in `docs/whmcs-mapping.md`, with the
API findings in `docs/whmcs-api-notes.md`. In short:

1. Set WHMCS up as in `docs/whmcs-setup.md`: currencies, the API role and
   credential, the IP restriction, and the price sync addon
   (`whmcs/modules/addons/fourthgen_console`).
2. Set `BILLING_ADAPTER=whmcs`, `WHMCS_API_URL`, `WHMCS_ENVIRONMENT` and
   the secrets `WHMCS_API_IDENTIFIER`, `WHMCS_API_SECRET`,
   `WHMCS_SYNC_SECRET` and, if used, `WHMCS_ACCESS_KEY`.
3. Put the approved price books into WHMCS:
   `npm run whmcs:sync` shows what would change, and
   `npm run whmcs:sync -- --apply --staff you@fourthgen.co.bw` makes the
   changes and writes a staff audit entry. Never set products up by hand
   in WHMCS; the next sync replaces them.
4. Check it: `npm run test:whmcs` reads only. With
   `WHMCS_TEST_WRITES=yes` it also runs the full adapter contract, which
   creates clients, orders and payments; it refuses to run when
   `WHMCS_ENVIRONMENT=production`. `npm run test:whmcs-addon` tests the
   addon's signature, replay and address checks (PHP, no WHMCS needed).
5. Move existing organisations: create one WHMCS client for each and update
   its `BillingAccount` row (provider `WHMCS`, the new client id). One
   organisation is always exactly one WHMCS client, and the console refuses
   to mix engines for one organisation.

Nothing else changes: pages, orders and payments only see the adapter.
WHMCS has no purchase order field on invoices, so PO numbers stay in the
console and are also written into the invoice notes.

## Website editor

Staff change the public website in the editor at /admin/content
([Payload](https://payloadcms.com) 3, inside this app). They sign in to
the staff console as usual; the editor reads the same session, so there
are no separate passwords. An Admin gives each person a website role on
the Staff page: Editors save drafts, Publishers also publish, schedule,
restore versions and approve legal text. Admins can always publish.

Payload keeps its tables in the `cms` schema of the same database, with
its own migrations in `src/cms/migrations`. After changing a collection:

```sh
npx payload migrate:create <name>   # CI fails if the config and migrations disagree
npm run cms:generate                # the editor's import map and TypeScript types
```

A production server applies pending editor migrations when it starts,
and gives the editor its first content (`src/cms/seed`): the home,
pricing, security and quote pages in every market, Botswana's legal text
(`src/cms/seed/legal`), and the header and footer, all as the site
showed them before. Each part is added once and never overwrites an
editor's work; `npm run cms:seed` does the same on a development database.

Pages are built from blocks (`src/cms/blocks`), drawn by
`src/components/site/blocks`. Each market's words are a locale in the
editor; a market without its own shows Botswana's. Nobody types a price:
text with an amount of money won't publish, and the Services and Live
prices blocks show the price book's live prices. Editors' changes are
drafts until a Publisher publishes them (now or scheduled). The Live
Preview button shows the draft at phone and desktop widths; it goes
through /preview, which turns on draft mode only for website staff.
The home page is `home`; any other page is /<market>/<address>. The
pricing page takes its heading, the words over the domain prices (Price
tables block) and its panel from the editor's `pricing` page around the
live price tables, the quote page its heading and the panel beside the
form from the `quote` page, and the security page shows the
market's data protection text (Legal pages) or else the `security` page.
Legal text never falls back to another market's. While the editor has
none of these, the site shows the built-in ones.

Insights are articles at /<market>/insights/<address>, with a topic, a
summary, a reading time worked out from their length, and a related
product from the catalogue. The Insights strip block shows the three
newest published ones and hides itself while there are none. The footer's
contact details (email, phone, hours, address, WhatsApp) fall back to the
market's settings in the staff console when left empty; its LinkedIn and
Facebook links show only when set. The header, footer and insights can be
scheduled like pages.

The Insights page (/<market>/insights, with topic chips) lists every
published insight. It isn't in the main navigation: the home page strip,
the footer and the Support menu link to it, and those links hide
themselves while nothing is published.

### Launch kits and the newsletter

When a product is saved as live, it gets a launch kit (/admin/launch-kits,
for website Editors and Publishers). A background job
(`launch-kit-drafts`) writes first drafts with the AI service: who the
product is for, questions and answers, an insight draft in the editor
and a LinkedIn post. Without `ANTHROPIC_API_KEY` it writes plain drafts
from the catalogue and says so. Nothing goes out until a Publisher
approves it: the product page at /<market>/products/<slug> (catalogue
words, the price book's price, the approved words, and Order or Ask for
a quote), the insight by publishing it in the editor, and the LinkedIn
post before its Copy button appears. The kit also has a branded share
image (/api/share/<slug>, 1200 by 627) and tracked links for LinkedIn,
Facebook, Google, the newsletter and email signatures, with the visits,
leads, quote requests, sign-ups and orders each campaign brought.

On the 1st, `newsletter-prepare` drafts each market's issue from the
insights published there the month before (/admin/newsletter). A
Publisher checks it and sends it to confirmed subscribers; every copy has
tracked links and one-click unsubscribe (`List-Unsubscribe` and
`/api/newsletter/unsubscribe/<token>`).

Uploaded images go to `MEDIA_DIR` (a volume in `docker-compose.prod.yml`)
and are served at /media. Storage sits behind `src/cms/storage`, so object
storage can be added later without changing pages or the editor.

### Free tools, follow-ups and pre-sales calls

The free tools are at /<market>/tools: the email security check, the
Microsoft 365 and Google Workspace cost calculator and the data protection
readiness checklist. Each answers on the page; "Email me this" creates or
updates a lead (with its source, tool and campaign) and starts a short
follow-up sequence, sent by the `lead-follow-ups` job every 15 minutes.
Quote requests, newsletter confirmations, Thapelo and bookings create
leads too. Staff see them at /admin/leads, filtered by source, and can stop
a sequence; every email has a one-click unsubscribe.

Pre-sales calls are booked at /<market>/book. Each engineer sets weekly
hours, a time zone and a meeting link at /admin/bookings; the booking
links on the site show only while someone has hours set. Both sides get a
calendar invite, a reminder the day before (`booking-reminders`), and a
cancel link.

### Backups

In production the `backup` service writes the database and the uploaded
images to `./backups` every night, encrypted with `BACKUP_PASSPHRASE`,
copies each one off-site (`OFFSITE_S3_*`), and deletes backups older than
`BACKUP_KEEP_DAYS` in both places. A restore is tested every Monday.
Taking one now, testing a restore and restoring for real are in
docs/deploy.md.

## Where things are

| Path | What |
| --- | --- |
| `src/app/(frontend)/[market]`, `src/components/site`, `src/config/site.ts` | Public website |
| `src/app/(frontend)/(auth)`, `src/app/(frontend)/app` | Customer sign-in and console pages |
| `src/app/(frontend)/admin` | Staff console |
| `src/payload.config.ts`, `src/cms`, `src/app/(payload)` | Website editor (Payload) at /admin/content, its collections and migrations |
| `src/server/billing` | Billing adapter, stub, WHMCS shell, organisation-scoped wrapper |
| `src/server/payments` | Payment adapter, stub card gateway, EFT |
| `src/server/connectors` | One connector per product family, all manual in Phase 1 |
| `src/server/markets`, `src/lib/domain/markets.ts` | Markets, country detection, waiting list |
| `src/server/catalogue`, `src/lib/domain/pricing.ts` | Marketplace, price books and prices |
| `src/lib/domain/money.ts` | Money and the one formatter |
| `src/components/ui`, `src/config/theme/tokens.json` | Components and design tokens |
| `src/server/support` | Tickets and the assistant (tools, confirmation, handover) |
| `src/server/db.ts` | `tenantDb(organisationId)`: every customer query is scoped to one organisation |
| `tests/` | Integration tests: tenant isolation, roles, billing contract, markets, orders, payments, staff, support |
| `e2e/`, `lighthouserc.cjs` | Browser checks: axe, site routing, Lighthouse |
| `docs/decisions.md` | What the console assumes and decided, for review |
| `docs/design-audit.md` | The design audit against Change Request 01 |
| `docs/screenshots/` | Every page at 390 and 1440 px, light and dark |
| `docs/shared-with-thebe.md` | Modules copied from Thebe, so security fixes reach both |
