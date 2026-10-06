# Exchange rates and the 14-day price book

Rates come from Bank of Botswana's daily reference rates. Nobody types them.

## What you need

- A free AllRatesToday account and API key: https://allratestoday.com/central-bank-rates-api/bob/
  - The free plan allows 300 requests a month. The console makes about 125.
  - AllRatesToday republishes Bank of Botswana's official tables with each table's publication date.
- On the server, add the key to `/opt/console/.env`:

  ```
  ALLRATESTODAY_API_KEY=art_live_...
  ```

  Then restart: `console restart`. The key is a secret. It is read only through `src/server/secrets.ts`, is never logged, and never shown in the console. Don't paste it into chat or tickets.
- The server must be able to reach `https://allratestoday.com` over HTTPS. Contabo allows this by default.

While the key is unset, everything works as before: staff type the next period's rates at /admin/pricing.

## What happens

| When | What |
| --- | --- |
| 05:30, 09:30, 13:30 and 17:30 every day (Gaborone time) | Fetch the latest table. A new one is checked, then stored with its publication date. |
| Every other Monday, 06:00, from 12 October 2026 | Build the period's price book from the newest table and the currency buffer. |

**Checking a table.** A table is refused, and nothing is stored, when:
- a currency we need is missing;
- a value isn't a positive number; or
- the publication date is in the future.

A table where any currency moved more than 10% since the last table in use is stored but **held back**. It stays unused until an Admin presses Accept at /admin/pricing.

**When something goes wrong.** In every case the previous rates stay in use, the next run tries again (each run also retries twice), and Admins get one email per day. This covers a failed fetch, a refused table, a held-back table, and no new table for more than 5 days.

**Price periods.** Prices change every 14 days, on a Monday, and the first change is on Monday 12 October 2026. Quotes are valid for 14 days by default, so a quote never outlives more than one price change. Staff can still give a quote up to 90 days.

**The price book.** On the first Monday of each period the console:

1. Sets the period's rates from the newest table in use. USD to BWP is the inverse of Bank of Botswana's "1 BWP = x USD". Pairs such as USD to ZAR are worked out through the pula. All of this uses exact decimal arithmetic.
2. Works out each switched-on market's suggestion for every priced item, the same way the Pricing page does.
3. Compares each suggestion with the price in effect in the period before.
   - **No price moves by more than the threshold** (3% by default, set at /admin/pricing): the new prices apply at once and are sent to WHMCS. The staff audit log records the automatic approval as "Automatic pricing", with the rates, the source date and every change.
   - **Any price moves by more:** nothing changes yet. Admins get an email with a link to /admin/pricing/periods/YYYY-MM-DD. The link opens the period after signing in, with one Approve button; opening the link doesn't approve anything. The approval is logged with the Admin's name, and the prices then go to WHMCS.

It also keeps these rules:
- Prices a person approved by hand for the period are left as they are.
- Items without a price yet are left for staff to price.
- If the newest table is more than 7 days old on the first day, the period waits: Admins get an email, and the build runs at the next successful fetch.
- Turning automation on mid-period doesn't change that period's prices. The first build is at the next period start.
- If WHMCS refuses the sync, Admins get an email and every rates run tries again.

**Mid-period.** Prices stay fixed for the 14 days. Admins get one email per currency pair per period when a new table makes what we pay dearer than the period's rate plus the currency buffer covers.

## Where to look

- /admin/pricing shows:
  - the current period's rates and their Bank of Botswana publication date;
  - the threshold;
  - the price books and how each was approved;
  - the last 30 tables, with held-back ones and their Accept buttons.
- /admin/pricing/periods/YYYY-MM-DD shows one period's rates and every price change.
- The staff audit log has these actions:
  - `pricing.auto-approved`
  - `pricing.period-approved`
  - `pricing.approval-requested`
  - `pricing.period-rates`
  - `pricing.rates-accepted`
  - `whmcs.price-sync` (actor "Automatic pricing" when automatic)

## Changing the source

`RateSource` in `src/server/pricing/official-rates.ts` is the only part that knows about AllRatesToday. A reader for another copy of Bank of Botswana's tables is another implementation of `latest()`.
