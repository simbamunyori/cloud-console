# Thebe as a billable product

Thebe's plans are sold and invoiced through the console like anything else in the
catalogue (`docs/STRATEGY_ROLLOUT.md`, U10). They sit under **Expense management**, and
Thebe keeps its own brand there: the customer's **Open Thebe** button uses Thebe's
colours, not ours.

## The plans

| Plan | Catalogue slug | Priced |
| --- | --- | --- |
| Founders | `thebe-founders` | Per organisation |
| Team | `thebe-team` | Per organisation |
| Organisation | `thebe-organisation` | Per user, at least 10 |

All three start as **drafts with placeholder prices**. They are added to the live
catalogue when the server starts. To sell them:

1. In **Admin > Catalogue**, check each plan's wording.
2. In **Pricing**, set the real prices in the price book.
3. Put the plans live. The product sync sends them to billing as usual.

## What happens when a customer subscribes

1. The order is invoiced and makes its setup task, exactly like any other product.
   That task is the manual fallback.
2. The console records the customer's Thebe account: plan, users, order and task.
3. If the Thebe partner is switched on and **Thebe organisations made automatically**
   is on in Features, the console asks Thebe's API to create the organisation:
   - **Created:** the task closes itself, the order becomes active once nothing else is
     open on it, and the customer is emailed the sign-in address. **Open Thebe** appears
     on their Services page.
   - **Refused:** Thebe's reason goes in the task's notes. The console tries again each
     night at 04:45, up to three times in all.
4. Otherwise, our team creates the organisation in Thebe from the task. They then
   record its id and address on the customer's page in admin (the **Thebe** card).

## Going live with the API

1. In **Admin > Partners > Thebe**, choose **API**, then enter the endpoint and key.
   Save, press **Test connection**, then **Switch on**.
2. In **Admin > Features**, turn on **Thebe organisations made automatically**. It
   can't be turned on until the partner is on.

## API contract

Every request carries `Authorization: Bearer <API key>`.

| Call | Used for | Answer |
| --- | --- | --- |
| `GET /v1/ping` | Test connection | `{ "account": "…" }` (optional) |
| `POST /v1/organisations` | A new subscription | `{ "id": "…", "url": "https://…" }` |

The body of `POST /v1/organisations`:

```json
{
  "reference": "<our organisation id>",
  "name": "Acme (Pty) Ltd",
  "plan": "Founders | Team | Organisation",
  "users": 1,
  "owner": { "name": "Neo Kgosi", "email": "neo@acme.co.bw" },
  "country": "BW"
}
```

`reference` lets Thebe recognise a retry and return the organisation it already made,
rather than make a second one. A 401 or 403 means the key was refused. Any other error
goes on the task with Thebe's `error` text. An address that isn't `https://` is
treated as an error.

Plan changes after the first order stay with the setup task. The console doesn't
change an existing Thebe organisation.
