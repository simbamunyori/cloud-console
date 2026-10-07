# Free tools and referral partners

`docs/STRATEGY_ROLLOUT.md`, U9. Decisions 222 to 227. Two switches in Admin > Features,
both off until an Admin turns them on.

## Free tool results

The switch is **Free tool results: share links and a head start on the score**.

- **Share links.** Under the free email security check's report, a visitor can tick to
  agree and press **Make a link**. The link,
  `/<market>/tools/email-security/shared/<token>`, shows that report to anyone for 90
  days. It isn't indexed by search engines. Expired links are deleted every night.
- **A head start on the score.** Someone who emailed themselves a report and later
  signs up with the same email address starts with that report in their security
  score, for the same domain. The score page says so until the first monthly report.
  The nightly check runs it again from then on.

## Referral partners

The switch is **Referral partners**. Turning it on opens `/<market>/referral-partners`
on the website. Add a link to it in the site editor (footer or a page) when you're
ready.

1. **Apply.** Accountants, consultants and IT resellers apply on the website, with
   consent. They get an email saying it arrived, and Admins get one to decide.
2. **Approve.** In **Admin > Referral partners**, Admins approve or decline each
   application. They can give a partner their own commission; otherwise the default
   applies (10% until changed on the same page). Approving sends the partner their
   referral link (`/<market>?ref=<code>`, which works on any page) and a private
   dashboard link.
3. **Referrals.** Anyone who signs up within 90 days of clicking the link counts as
   the partner's customer. A paused partner's link stops counting new sign-ups.
4. **Statements.** On the 3rd of each month at 06:30, each partner with customers gets
   a statement: what their customers paid us last month, read from billing payments,
   times their commission. Payments in a currency with no exchange rate are left out
   and shown.
5. **Payouts.** Partners enter their bank details on their dashboard. The details are
   sealed like partner secrets, and only shown to Finance and Admins in Admin >
   Referral partners. Finance pays by EFT and records the bank's reference there. The
   partner is emailed.

The partner's dashboard shows their link, their customers (organisation names and
dates only), their statements and payouts. It needs no password, so the link is long
and private. Declined and ended partners' links stop working.
