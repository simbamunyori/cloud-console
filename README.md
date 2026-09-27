# Cloud Console

The customer and staff console for Fourth Generation Technologies: buy and
manage cloud services, see and pay invoices, get support. Phase 1 of the
plan in `docs/CONSOLE_BRIEF.md`.

- Customers sign in at `/sign-in` and use the console at `/app`.
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
# Fill in TOTP_ENCRYPTION_KEY:  openssl rand -base64 32
docker compose up -d          # PostgreSQL, and Mailpit to catch email
npm install
npm run db:migrate            # or `npm run db:dev` while changing the schema
npm run db:seed               # demo organisation, staff accounts, catalogue
npm run dev                   # http://localhost:3000
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
refuses to run in production unless `SEED_DEMO=yes`.

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
the source or docs, and on the company's old name.

CI (`.github/workflows/ci.yml`) runs `npm audit` on production
dependencies, checks the migrations match the schema, seeds twice, runs
lint, typecheck, the copy check, the tests and a production build, and
builds the Docker image.

## Environment variables

`.env.example` lists them all, with comments. Settings are read and
checked in `src/server/env.ts`; secrets are read only through
`src/server/secrets.ts`, so a vault can replace the environment later
without touching anything else. Secrets are never logged, never shown in
the UI and never sent to the assistant.

| Variable | Needed | What it does |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `APP_URL` | Yes in production | Public address, used in email links |
| `CONSOLE_NAME` | No | What customers see the console called (default "Cloud Console") |
| `TOTP_ENCRYPTION_KEY` | Yes, secret | 32 random bytes, base64. Encrypts authenticator secrets. Losing it means everyone sets up their authenticator again |
| `SMTP_URL` | Yes in production | Outgoing mail, e.g. `smtps://user:pass@smtp.example.com:465`. Mailpit in development |
| `MAIL_FROM` | No | Sender address |
| `BILLING_ADAPTER` | No | `stub` (default) or `whmcs` |
| `WHMCS_API_URL` | With WHMCS | WHMCS API address |
| `WHMCS_IDENTIFIER`, `WHMCS_SECRET` | With WHMCS, secret | API credentials |
| `WHMCS_ACCESS_KEY` | Optional, secret | If WHMCS requires an API access key |
| `PAYMENT_ADAPTER` | No | `stub` only, until the card gateway is chosen |
| `EFT_BANK_NAME`, `EFT_ACCOUNT_NAME`, `EFT_ACCOUNT_NUMBER`, `EFT_BRANCH_CODE`, `EFT_SWIFT_CODE` | Yes in production | Our bank account, shown on invoices for EFT payments. Blank ones are left off |
| `ANTHROPIC_API_KEY` | Optional, secret | Switches the support assistant on. Without it, the assistant page offers a ticket instead |
| `ANTHROPIC_MODEL` | No | Model the assistant uses (default `claude-sonnet-5`) |
| `ADMIN_IP_ALLOWLIST` | Recommended in production | Comma-separated addresses or IPv4 ranges (CIDR) allowed to open `/admin`. Empty allows any address |
| `CONSOLE_JOBS` | No | `off` stops background jobs on this server, for extra app servers |
| `POSTGRES_PASSWORD`, `DOMAIN` | Production compose | Database password, and the domain Caddy gets a certificate for |
| `SEED_DEMO` | No | `yes` lets the seed run in production. Don't |

The company name, legal name and support address live in
`src/config/app.ts`. Every colour, font, radius and spacing value lives in
`src/config/theme/tokens.json`, seeded from `brand/`.

## Deploy

```sh
cp .env.example .env    # fill it in
docker compose -f docker-compose.prod.yml up -d
```

This runs the app, PostgreSQL and Caddy (automatic HTTPS for `DOMAIN`). The
app runs `prisma migrate deploy` on start. Background jobs (email delivery,
the stub's nightly billing run, default PO numbers) run inside the app
through pg-boss, in the same database.

## Swapping the stub for WHMCS

The full mapping, method by method, is in `docs/whmcs-mapping.md`, with the
API findings in `docs/whmcs-api-notes.md`. In short:

1. Fill in each method of `WhmcsBillingAdapter`
   (`src/server/billing/whmcs/whmcs-adapter.ts`). The transport and every
   field mapping (`whmcs/map.ts`, with tests) are already written, and each
   method names the WHMCS action it calls. WHMCS field names appear only in
   `map.ts`.
2. Set `BILLING_ADAPTER=whmcs`, `WHMCS_API_URL`, `WHMCS_IDENTIFIER`,
   `WHMCS_SECRET` and, if used, `WHMCS_ACCESS_KEY`. Add the console's
   address to WHMCS's API IP allowlist.
3. Run the adapter contract tests (`tests/billing-contract.ts`) against a
   WHMCS staging copy. The same tests pass on the stub today.
4. Move existing organisations: create one WHMCS client for each and update
   its `BillingAccount` row (provider `WHMCS`, the new client id). One
   organisation is always exactly one WHMCS client, and the console refuses
   to mix engines for one organisation.

Nothing else changes: pages, orders and payments only see the adapter.
WHMCS has no purchase order field on invoices, so PO numbers stay in the
console and are also written into the invoice notes.

## Where things are

| Path | What |
| --- | --- |
| `src/app/(auth)`, `src/app/app` | Customer sign-in and console pages |
| `src/app/admin` | Staff console |
| `src/server/billing` | Billing adapter, stub, WHMCS shell, organisation-scoped wrapper |
| `src/server/payments` | Payment adapter, stub card gateway, EFT |
| `src/server/connectors` | One connector per product family, all manual in Phase 1 |
| `src/server/catalogue`, `src/lib/domain/pricing.ts` | Marketplace and prices |
| `src/server/support` | Tickets and the assistant (tools, confirmation, handover) |
| `src/server/db.ts` | `tenantDb(organisationId)`: every customer query is scoped to one organisation |
| `tests/` | Integration tests: tenant isolation, roles, billing contract, orders, payments, staff, support |
| `docs/assumptions.md` | What Phase 1 assumes, for review |
| `docs/shared-with-thebe.md` | Modules copied from Thebe, so security fixes reach both |
