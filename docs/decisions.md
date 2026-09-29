# Decisions and assumptions

What the console assumes, decided or leaves out, for review before launch. Each item says what it does today and what would change it. This replaces `docs/assumptions.md` from Phase 1: its items are carried over below, updated where Change Request 01 changed them.

## Markets (Change Request 01)

1. **Four markets, Botswana on.** Botswana (`bw`, BWP), South Africa (`za`, ZAR), Zimbabwe (`zw`, USD) and International (`global`, USD) exist; only Botswana is switched on and it is the default. Admins switch the others on at `/admin/markets`; every settings change is logged with who made it.
2. **A market's currency is data.** Zimbabwe uses USD because its market row says so. A new currency is a market setting plus price book entries, not a code change. The console accepts any ISO 4217 code the runtime's `Intl` knows.
3. **Unknown or switched-off markets fall back to the default market.** A visitor whose country has no market that is on, or whose market is off, lands on `/bw`, never a 404 and never `/global` unless it is on and their country has no market of its own. A 404 appears only when someone asks for a switched-off market by name (`/za` while it is off).
4. **How "/" picks a market:** the switcher's cookie first, then the country from `GEO_COUNTRY_HEADER` (default `cf-ipcountry`, since the site sits behind Cloudflare), then a GeoLite2 lookup if `GEOLITE2_DB_PATH` is set, then the default market. Cloudflare's "XX" (unknown) and "T1" (Tor) count as unknown.
5. **Crawlers are never redirected.** Search engines get the default market's home at `/`, which is the `x-default`, with hreflang links to every market that is on. Each market's pages are their own canonical. The sitemap lists only markets that are on and is built per request.
6. **Sign-up needs a market.** A company's billing country picks its market at sign-up. A country with no market that is on doesn't get an account: the person sees "not available in your country yet" and can leave their details, which staff see at `/admin/waitlist`.
7. **A customer's currency is fixed.** It is set from the market at sign-up. Staff can move a customer to another market (logged, and shown to the customer); the currency changes only if they have no invoices yet.
8. **Tax is off everywhere.** Each market has a tax switch, rate, label and inclusive or exclusive display, and the stub billing engine applies them by country. All are off with a rate of 0 until finance sets real ones. Turning tax on also needs the same rates in WHMCS.
9. **EFT bank details are per market**, edited in market settings (Phase 1 read them from `EFT_*` environment variables, now removed). The demo seed fills Botswana's with obvious placeholders, and a production server refuses to start while they are there (item 54); the other markets have none yet. Market settings won't save with bank transfer on and no bank details, so fill them in (or offer card only) when switching a market on.
10. **Local data copy is Botswana only.** It is offered only in the `bw` market, and the site mentions it only there: on the Data protection service card and the Security page, never in the hero.

## Prices

11. **Customers only see approved prices.** Each market has a price book in its currency. The cost, exchange rate, buffer and margin rule only suggests a price; staff approve it at `/admin/pricing`, one item or all at once, optionally at a different amount. Customers never see a live conversion.
12. **Approved prices start next month**, so the current month's prices never move, except for something not yet priced in that market, which applies at once.
13. **Prices are fixed per month and rounded up to a whole unit** of the market's currency (P 190.00, not P 187.43). A fixed price set in one currency converts to another at the rate plus the buffer, with no margin.
14. **Exchange rates are entered by staff**, per currency pair and month, at `/admin/pricing`; every change is logged. The seeded rates (USD to BWP 13.45, USD to ZAR 18.20, BWP to ZAR 1.35, BWP to USD 0.0744) and the seeded margins and 3% buffer are placeholders for development. Seeded rates record no staff member, which is how the production start-up check (item 54) tells them apart.
15. **Products and domain endings are offered per market.** A product or ending not offered in a market can't be seen or ordered there.
16. **Changing the number of users reprices every user** at this month's price. The part month for added users goes on the next invoice; fewer users take effect from the next renewal.
17. **Set-up times are wall-clock hours.** "Usually ready within 8 hours" counts every hour, not only working hours.

## Money and language

18. **One formatter.** Every amount, on screen, in emails, audit text and the assistant, goes through `formatMoney` with the organisation's market locale (`en-BW`, `en-ZA`, `en-ZW`, `en-US`). Staff pages that list many customers use `en-BW`, the team's own. A test fails on currency symbols or codes written by hand in UI code.
19. **English only.** Locales change number, date and currency formats, not the language.

## Public site

20. **Legal pages are placeholders.** Each market has privacy, terms and data protection pages, marked for a lawyer to supply; the console doesn't write legal text. A market's legal page can point to a hosted document instead (an `https` link in market settings). The privacy page keeps one factual section: the support assistant uses an AI service hosted outside the customer's country.
21. **No testimonials yet.** The section stays hidden until real quotes are added to `src/config/site.ts`.
22. **Site pictures are the real console with demo data**, taken by `npm run screenshots:hero`: the Home page at 2x for the hero on wide screens, a close-up of its top for phones and tablets, and a monthly invoice's lines for the Cloud Console section. Retake them when those pages change.
23. **The Thebe card uses a drawing, not a screenshot.** Running Thebe to capture it with demo data wasn't possible here, so the card shows a purpose-made illustration of its approvals list (amounts in the market's currency), described as such to screen readers. Replace it with a real Thebe screen when one is supplied.
24. **"Our own data centre" is a market switch.** Server copy says "Managed servers, monitored and backed up." A market's "Our own data centre is live here" setting adds "Run from our own data centre." to the servers card and the marketplace's Servers heading; it is off everywhere until colocation is live.
25. **The service status link** in the footer points to `STATUS_PAGE_URL` and is hidden while that is unset.
26. **"Find your domain" on the site** opens the console's domain search. Signed-out visitors sign in first and then see their results; new customers open an account first and search again.

## Design

27. **Four screen colours differ slightly from the brand pack** to pass WCAG AA: the filled button blue, its hover, the dark-theme link blue and the light-theme error red. The brand colours themselves are unchanged. `docs/design-audit.md` has the numbers.
28. **The theme is a cookie.** Light, dark or match device, chosen at the bottom of the console sidebar or in the site footer, read by the server so pages render in it with no flash.
29. **Lighthouse runs on a simulated mid-range phone** (Lighthouse's mobile default) with devtools throttling, three runs per page, the median counting. The home page's largest paint is about 2.2 s against the 2.5 s budget.
30. **Screenshots are WebP and not in Git LFS.** The committed set (390 and 1440 px, light and dark) is about 8 MB. Pages longer than 12,000 px are cut there. Move to LFS if the folder passes about 50 MB.

## Billing and payments

31. **The stub stands in for WHMCS.** It is simpler in a few places, listed in `docs/whmcs-mapping.md` ("Where the stub is simpler than WHMCS"): a domain renewal extends the expiry at once, the stub never suspends for non-payment by itself, and there is no credit balance. The stub raises invoices in a nightly job; WHMCS does this from its own cron.
32. **Purchase order numbers.** WHMCS has no PO field on invoices, so the console stores PO numbers and also writes them into the invoice notes.
33. **The card gateway is a stub.** Card payments go to a test payment page until a gateway is chosen. The adapter settles a payment by asking the gateway, never from the return address, and credits the invoice once.
34. **EFT is confirmed by a person.** The customer says they paid; finance staff find it in the bank statement and confirm it, or say why they can't. There is no bank feed.
35. **Saved cards live in the billing engine.** The console never sees or stores a full card number. Adding or removing a card waits for the real gateway.

## Business

36. **Brand and name.** The brand pack in `brand/` is the production identity. The console shows "Fourth Generation Technologies"; invoices, statements and the site footer show "Fourth Generation Technologies (Pty) Ltd". Both are in `src/config/app.ts`. The console's own name ("Cloud Console") and its domain are environment settings.
37. **Support addresses are placeholders.** Every market's support email is `support@localhost`. Set real ones in market settings before launch; they appear on the site, invoices and emails. A production server refuses to start until they are set (item 54).
38. **Company details on invoices are per market.** The From block shows the legal name, the market's registered office, company registration number and, while tax is on, the tax number. Botswana is seeded with registration BW00001816431 and registered office Plot 11662/A, Mogoditshane, Botswana. The other markets have none until finance says which entity invoices there.

## Staff and security

39. **Staff reads are not audited.** Every staff change is written to the customer's activity log with the staff member's name. Staff looking at a customer's pages is not logged.
40. **`/admin` is open to any address unless `ADMIN_IP_ALLOWLIST` is set.** Set it in production.
41. **Two-step login is required for everyone** from the first sign-in. Passkeys were considered but not added.
42. **Nothing is deleted yet.** Tables that hold customer data have `deletedAt` and `purgeAfter` (30 days after notice), but no journey deletes anything, so the purge job is not built.
43. **Forgotten passwords.** "Forgot password?" on customer sign-in emails a link that works once, for 30 minutes; asking again cancels the older link. The page answers the same whether or not the address has an account. A new password signs the person out everywhere and doesn't sign them in: they sign in again with the new password and their authenticator code. The change is in each organisation's activity log and emailed to the person. Staff sign-in has no self-service reset yet.
44. **Rate limits** are kept in PostgreSQL so every copy of the app shares them: sign-in, codes, sign-up, the waiting list and the assistant (20 questions per person in 10 minutes, 300 per organisation a day). "Forgot password?" is limited to 10 requests an hour from one address and 3 emails an hour to one account, silently past that. The numbers are starting guesses.

## Support assistant

45. **It runs on Anthropic, outside the customer's country.** It is off until `ANTHROPIC_API_KEY` is set. It only reads the signed-in organisation's data through a fixed set of read-only tools, is never sent passwords, codes, card numbers, bank details or keys, and treats ticket text and customer data as data, not instructions. Every tool call is in the customer's activity log.
46. **It can propose two things**: changing the number of users on a service, and handing over to our team. Both wait for the customer to press Confirm. A handover opens a ticket with the whole conversation.
47. **Only earlier questions and answers are sent back** with each new question, not earlier lookups.

## Billing views

48. **Only monthly invoices are compared.** An invoice shows "what changed since last month" (and "no longer billed" lines) only when it is a monthly invoice: it bills services for a period, and nothing but services and domain renewals, and wasn't raised by an order. It is compared with the monthly invoice before it, skipping order, set-up, part-period and upgrade invoices in between. The assistant follows the same rule.

## Console

49. **The security score** on Home adds up six checks to 100: everyone has finished two-step login (25), the person looking has at least three backup codes (10), no one has been inactive for 90 days (15), three or fewer owners and admins (10), email and documents backed up if they are with us (20), and managed detection and response (20). Each unmet check links to its fix. The weights are a first proposal.
50. **Search** in the top bar covers the organisation's services, domains, invoice numbers, ticket subjects, the marketplace and the console's pages. Notifications are the same list as Home's "Needs your attention", with a count of the ones that aren't just information.

## Hosting

51. **Backups.** The privacy notice is now a placeholder per market, so it no longer promises backups; set them up with hosting and have the lawyer's text describe them.

## Development

52. **Tests share the database in `DATABASE_URL`.** They create their own organisations and leave them behind. The README shows how to point them at a separate database. Take screenshots from a freshly seeded database, or test data shows up in them.
53. **Demo accounts have a published password.** The seed refuses to run in production unless `SEED_DEMO=yes`.
54. **Production refuses placeholders.** In production the server won't start while any development placeholder is set: a `support@localhost` market email, the demo bank details (a "Demo" bank or an all-zero account or branch number), seeded exchange rates, the demo accounts, or a localhost `APP_URL` or `MAIL_FROM`. It lists each one and where to fix it. `ALLOW_PLACEHOLDERS=yes` starts a demo or CI server anyway, with a warning.
55. **Browser checks sign in with test sessions** made straight in the database (`e2e/support/sessions.ts`), which refuses to run with `NODE_ENV=production`.
56. **WHMCS is the billing engine in production** (`BILLING_ADAPTER=whmcs`). Production refuses to start on the stub, with WHMCS credentials missing, or with `WHMCS_ENVIRONMENT` other than `production`. Credentials come only from environment variables.
57. **Prices reach WHMCS only through the sync.** `npm run whmcs:sync` puts the approved price books into WHMCS through the Fourth Generation Console Sync addon, which accepts only HMAC-signed requests under 5 minutes old, never the same request twice, from allowed addresses, and can only change product groups, products, descriptions, visibility and prices. Every change is in the WHMCS activity log and the console's staff audit log. Nobody sets products up by hand in WHMCS.
58. **Seats are a "Users" quantity option** on per-user products, so WHMCS keeps the right user count and works out part-month charges itself.
59. **The current WHMCS install is the test environment.** The full contract suite runs on it with `WHMCS_TEST_WRITES=yes`; it refuses to run when `WHMCS_ENVIRONMENT=production`. Before launch WHMCS is reset to a clean database and that variable is set. Domain orders reach a registrar only in production.
60. **Cards are not saved in WHMCS.** Its AddPayMethod needs the full card number, which the console never handles; saved cards stay with the gateway.

## Carried over from the Phase 1 go-ahead

Checked for Change Request 01, section 6:

- **Email adapter:** SMTP in production (`SMTP_URL`), Mailpit in `docker-compose.yml` for development. In place.
- **Assistant data rules and tool audit:** items 45 to 47. In place; the privacy page states the AI service is hosted outside the customer's country.
- **Security headers, CI audit, admin allowlist:** a nonce-based content security policy and security headers in `src/proxy.ts`; secure, httpOnly, SameSite session cookies with the `__Host-` prefix in production; `npm audit` on production dependencies in CI; `ADMIN_IP_ALLOWLIST`. In place.
- **EFT details per market:** item 9. Added in this change.
- **`docs/shared-with-thebe.md`:** in place. Change Request 01 copied nothing new from Thebe.
