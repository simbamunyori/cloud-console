# Console experience

What `docs/STRATEGY_ROLLOUT.md` U11 added to the customer console. Each part has its own
switch in **Admin > Features** and is off until an Admin turns it on.

## First-week checklist ("First-week checklist")

New customers' Owners and Admins see **Your first week** at the top of their home page.
It has these items:

| Item | Ticks itself when |
| --- | --- |
| Add your company details | The organisation has an address and city |
| Invite your team | Someone else has joined, or an invitation is waiting |
| Order your first service | The customer has a live service, an order or a quote |
| See your security score (only with the security score on) | An email domain is set for the score |

It shows for the organisation's first 14 days. It disappears once every item is done, or
once an Owner or Admin presses **Hide this**, which hides it for the whole organisation.
Billing and read-only members never see it.

## Named account contact ("Named account contacts")

- **Choosing the contact.** Admins choose the colleague who looks after each customer on
  the customer's page in admin (**Account contact**). Only Admins can do this, using a
  new `assignAccountContacts` permission. The change is in the customer's activity log.
- **What the customer sees.** On their home page, under the security score: the
  colleague's name, job title, email and direct phone.
- **The colleague's own details.** Each colleague keeps their job title and phone on
  their **My work** page.
- **When a colleague leaves.** A deactivated colleague is no longer shown. Choose
  someone else for their customers.

## Plan recommender ("Plan recommender in the console")

- **Where it is.** The Marketplace gets a link to **Which plan fits?** at
  `/app/marketplace/recommend`.
- **How it decides.** It asks how many people need an account, which provider they
  prefer and what they need. Then it shows the lowest-priced Microsoft 365 or Google
  Workspace plan that covers those needs, at the customer's market's prices, with a
  button to order that number of people.
- **Shared logic.** It uses the same rules (`src/server/tools/calculator.ts`) as the
  website's cost calculator and Thapelo's plan advice. A plan that isn't on sale in the
  market is never recommended.
- **Existing customers.** A customer who already has a plan is pointed to Services to
  change their count.

## Phone-width review

`e2e/phone-width.spec.ts` opens every console screen at 390 px:

- as a customer in Botswana, South Africa and Zimbabwe, each in its own currency and
  date format;
- as staff.

It fails if anything makes the page wider than the screen. Wide tables must scroll
inside their own box. The South Africa and Zimbabwe customers are small test
organisations the check makes in development and CI databases. It runs with the other
browser checks in CI.
