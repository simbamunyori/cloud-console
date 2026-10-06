# Licensing partners: what the console expects

Microsoft 365 and Google Workspace automation (`docs/STRATEGY_ROLLOUT.md`, U6). Two
partners are set up in **Admin > Partners**:

- **Microsoft CSP (First Distribution)** for Microsoft 365
- **Google Workspace (Digicloud)** for Google Workspace

Each one is used only once it is switched on there and its feature is on in
**Admin > Features** ("Microsoft 365 automation", "Google Workspace automation").
Customers only ever see Fourth Generation Technologies.

## What stays the same

Every change a customer makes still creates its setup task first, exactly as before.
That task is the manual fallback:

- If the partner's API takes the change, the task closes itself with the note "Done
  automatically through …" and the customer sees the change straight away.
- If the API refuses, the task stays open with the reason, and our team does it by
  hand. Nothing is lost.

Licence counts are changed in **Services**, and billing follows with proration
(an increase is charged for the rest of the period, a decrease applies from the next
invoice). With automation on, the new count also goes to the partner.

## Going live

1. In Admin > Partners, open the partner. Choose **API**, then enter the endpoint,
   the key, any secret and custom fields (such as a reseller ID), and the admin access
   link. Save, press **Test connection**, then **Switch on**. Manual mode also works:
   the partner's test passes, and customers can give admin access through the link
   set there.
2. In Admin > Features, turn on the vendor's automation.
3. Check each customer's tenant reference at /admin/customers/<id>/licences. The
   console uses the vendor tenant ID when set, otherwise the primary domain.

## Admin access

Customers' Owners and Admins press **Give us access** on their Users and licences page:

- The link comes from the partner's API when it gives one.
- Otherwise it comes from the **Admin access link** in Partners, with `{domain}`
  replaced by the customer's domain.
- With neither, our team gets a task to send the invitation.

The nightly sync records when access is given. In manual mode, staff record it on the
customer's licences page in admin, and enter the tenant's security settings there.
The settings count in the customer's security score under "Microsoft 365 or Google
Workspace".

## API mode

Every request carries:

- `Authorization: Bearer <API key>`
- `X-Api-Secret: <API secret>` if one is saved
- `X-<name>: <value>` for each custom field

`:tenant` is the vendor tenant ID or the primary domain.

| Call | Used for | Answer |
| --- | --- | --- |
| `GET /v1/ping` | Test connection | `{ "account": "…" }` (optional) |
| `GET /v1/customers/:tenant/subscriptions` | Nightly sync | `{ "subscriptions": [{ "sku", "name", "quantity" }] }` |
| `PATCH /v1/customers/:tenant/subscriptions/:sku` | A licence count changed in Services | Body `{ "quantity" }`; any 2xx |
| `GET /v1/customers/:tenant/users` | Nightly sync | `{ "users": [{ "email", "name", "enabled", "skus": [], "lastSignInAt" }] }` |
| `POST /v1/customers/:tenant/changes` | A customer's change | Body `{ "kind": "assign" \| "unassign" \| "add_user" \| "remove_user", "email", "name", "sku" }`; any 2xx |
| `GET /v1/customers/:tenant/consent?domain=` | Admin access | `{ "status": "none" \| "pending" \| "granted", "link": "https://…" }` |
| `GET /v1/customers/:tenant/security` | Security settings, once access is given | `{ "checks": [{ "key", "title", "ok" }] }` |

How the console reads the answers:

- A 404 means "nothing there". On the count change, a 404 means there's no such
  subscription, and the task stays open.
- A 401 or 403 means the key was refused.
- Any other error leaves the change to our team, with the partner's `error` text in
  the task's notes.
- Only `https://` links are kept.

## The nightly sync (03:00)

For each tenant whose automation is on, the sync does four things:

1. It records the partner's count for each licence. A count that differs from the
   console's, or a subscription the console doesn't know, becomes a task.
2. It compares people and the licences they hold. Any differences become one task per
   tenant, listing up to 25 of them. Sign-in dates are copied.
3. It records admin access and its link.
4. When access is given, it reads the security settings.

Each task is opened once and isn't repeated while it is open. The billing check at
03:30 (billed against bought) carries on as before.

## A partner-specific adapter

If First Distribution's or Digicloud's API doesn't match this contract, add a class
implementing `LicensingVendor` in `src/server/licences/vendor.ts` and choose it in
`licensingVendorFrom`. Nothing else in the console changes.
