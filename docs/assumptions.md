# Phase 1 assumptions

What Phase 1 assumes or leaves out, for review before launch. Each item
says what the console does today and what would change it.

## Business

1. **Brand and name.** The brand pack in `brand/` is the production
   identity. The console shows "Fourth Generation Technologies"; invoices
   and statements show "Fourth Generation Technologies (Pty) Ltd". Both are
   in `src/config/app.ts`. The console's own name ("Cloud Console") and its
   domain are not decided, so they are environment settings.
2. **Support address.** `company.supportEmail` in `src/config/app.ts` is
   `support@localhost`, a placeholder. It appears on invoices, security
   emails and the privacy page, so set the real address before launch.
3. **Prices are placeholders.** The seeded category margins (for example
   20% on productivity, 40% on servers), the 3% currency buffer and the
   USD to BWP rate of 13.45 are made up for development. Staff set the real
   ones at `/admin/pricing`, and each change is logged there.
4. **Prices are fixed per month.** A price is worked out once for each
   month from that month's rate, buffer and margin, then rounded up to a
   whole pula. Pricing changes apply from next month; the current month's
   prices never move.
5. **Changing the number of users reprices every user.** After a seat
   change, all users on that service are billed at this month's price,
   not only the new ones. The part month for added users goes on the next
   invoice; fewer users take effect from the next renewal.
6. **Set-up times are wall-clock hours.** "Usually ready within 8 hours"
   counts every hour, not only working hours.
7. **No VAT.** Prices are shown and invoiced without VAT. The plan
   mentioned a per-country VAT setting switched off by default; it was not
   built in Phase 1 because nothing needed it yet. Adding it touches
   pricing, invoice lines and the WHMCS tax settings.
8. **Currency.** New organisations use BWP. Every amount carries its
   currency, so others can be added, but the marketplace and statements
   show one currency per organisation.

## Billing and payments

9. **The stub stands in for WHMCS.** It is simpler in a few places, listed
   in `docs/whmcs-mapping.md` ("Where the stub is simpler than WHMCS"): a
   domain renewal extends the expiry at once, the stub never suspends for
   non-payment by itself, and there is no credit balance. The stub raises
   invoices in a nightly job; WHMCS does this from its own cron.
10. **Purchase order numbers.** WHMCS has no PO field on invoices, so the
    console stores PO numbers and also writes them into the invoice notes.
11. **The card gateway is a stub.** Card payments go to a test payment page
    until a gateway is chosen. The adapter settles a payment by asking the
    gateway, never from the return address, and credits the invoice once.
    A real gateway needs its adapter written and its webhook added.
12. **EFT is confirmed by a person.** The customer says they paid; finance
    staff find it in the bank statement and confirm it, or say why they
    can't. There is no bank feed.
13. **Saved cards live in the billing engine.** The payment methods page
    lists the cards the billing engine holds (in the stub, sample ones) and
    our EFT details. The console never sees or stores a full card number.
    Adding or removing a card waits for the real gateway.

## Staff and security

14. **Staff reads are not audited.** Every staff change (confirming a
    payment, finishing a set-up task, replying to a ticket, changing
    prices) is written to the customer's activity log with the staff
    member's name. Staff looking at a customer's pages is not logged.
15. **`/admin` is open to any address unless `ADMIN_IP_ALLOWLIST` is set.**
    Set it in production, for example to the office or VPN range.
16. **Two-step login is required for everyone**, customers and staff, from
    the first sign-in. Passkeys were considered but not added in Phase 1.
17. **Nothing is deleted in Phase 1.** Tables that hold customer data have
    `deletedAt` and `purgeAfter` (30 days after notice), but no journey in
    Phase 1 deletes anything, so the purge job is not built yet. It belongs
    with the first feature that removes data, such as closing an account.
18. **Rate limits** are kept in PostgreSQL so every copy of the app shares
    them: sign-in, codes, sign-up, and the assistant (20 questions per
    person in 10 minutes, 300 per organisation a day). The numbers are
    starting guesses.

## Support assistant

19. **It runs on Anthropic, outside Botswana.** It is off until
    `ANTHROPIC_API_KEY` is set. It only reads the signed-in organisation's
    data through a fixed set of read-only tools, is never sent passwords,
    codes, card numbers, bank details or keys, and treats ticket text and
    customer data as data, not instructions. Every tool call is in the
    customer's activity log.
20. **It can propose two things**: changing the number of users on a
    service, and handing over to our team. Both wait for the customer to
    press Confirm. A handover opens a ticket with the whole conversation.
21. **Only earlier questions and answers are sent back** with each new
    question, not earlier lookups, so the model looks data up again when
    it needs it.

## Legal

22. **The privacy page needs a lawyer's review.** `/privacy` is written in
    plain language from what the console does, and cites Botswana's Data
    Protection Act 18 of 2024 and a 72-hour breach notice. It is not legal
    advice.
23. **Backups.** The privacy page says an encrypted backup is kept off-site
    for 30 days. Phase 1 does not set up backups; make that sentence true
    when hosting is set up, or change it.

## Development

24. **Tests share the database in `DATABASE_URL`.** They create their own
    organisations and leave them behind. The README shows how to point
    them at a separate database.
25. **Demo accounts have a published password.** The seed refuses to run
    in production unless `SEED_DEMO=yes`.
