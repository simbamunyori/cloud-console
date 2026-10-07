# Security provider: what the console expects

Managed security and the 24/7 SOC (`docs/STRATEGY_ROLLOUT.md`, U5) are white-label.
An Admin sets the provider up in **Admin > Partners > Security provider**. Several
providers can be stored; one is active. Customers only ever see "Managed security"
from Fourth Generation Technologies: never the provider's name, its references or our
internal notes.

## Going live

1. Sign the partner agreement (see `docs/soc-partner-evaluation.md`).
2. Admin > Partners > Security provider: add the provider, choose **Manual** or
   **Generic API and webhook**, save, press **Test connection**, then **Make active**.
3. Set response targets and the escalation email at **/admin/soc** (Admins).
4. Admin > Features: turn on **Managed security**. The marketplace
   order button and the customer's Managed security page appear at once.

Until step 4, the marketplace page for Managed detection and response shows a
"Talk to a security specialist" form instead of the order button, and each answer becomes a
pre-sales lead at /admin/leads.

Changing the active provider's endpoint or keys switches it off and turns the feature
off, until a new test passes. A failed test does the same. A provider can't be made
active while customers have tenants with another one.

## Manual mode (the fallback)

Works with any provider. Each step is done by our team in the provider's portal:

- An order for managed security makes a setup task (as every manual product does) and
  adds the customer at **/admin/soc** as "Being set up".
- Create the tenant in the portal, then on the customer's SOC page record the tenant
  reference, the agent install link and a note. The customer sees the link at once.
- Add each device and its status. Devices count in the customer's security score.
- Open incidents by hand at /admin/soc, and save each month's report with its link.

## API and webhook mode

### Calls the console makes

Every request carries:

- `Authorization: Bearer <API key>`
- `X-Api-Secret: <API secret>` if one is saved
- `X-<name>: <value>` for each account setting and custom field (`name=value`, one
  per line)

| Call | Used for | Answer |
| --- | --- | --- |
| `GET /v1/ping` | Test connection | `{ "account": "…" }` (optional) |
| `POST /v1/tenants` | A new subscription | Body `{ "name", "reference" }`; answer `{ "id": "…" }` |
| `GET /v1/tenants/:id/enrolment` | The agent installer link | `{ "link": "https://…", "note": "…" }` |
| `GET /v1/tenants/:id/devices` | Device list and health | `{ "devices": [{ "id", "name", "os", "health", "lastSeenAt" }] }` |
| `GET /v1/incidents?since=<ISO date>` | Polling, in case a webhook was missed | `{ "incidents": [incident] }` |
| `GET /v1/tenants/:id/reports/:month` | Monthly report (`2026-10`) | `{ "title", "summary", "url": "https://…" }` |
| `POST /v1/tenants/:id/suspend` | Suspend a tenant | any 2xx |
| `DELETE /v1/tenants/:id` | Remove a tenant | any 2xx |

The sync runs every 5 minutes: it creates tenants for new subscriptions, fetches each
one's install link and devices, polls incidents from the last 2 hours, and on the
first three days of a month fetches last month's report. A 404 reads as "nothing yet";
a 401 or 403 means the key was refused. One tenant the provider refuses doesn't hold
up the others.

An incident is `{ "id", "tenant", "title", "summary", "severity", "device", "status" }`.
`severity` is `low`/`info`, `medium`/`moderate`, `high` or `critical` (anything else
reads as medium). `status: "resolved"` resolves ours. Device `health` is
`healthy`/`ok`/`protected`, `at-risk`/`warning`, `offline` or `unprotected` (anything
else reads as at risk). Dates are ISO 8601. Only `https://` links are kept.

### Webhooks the console receives

`POST <console>/api/webhooks/security/<provider id>`; the full address is shown on the
provider's card in Partners.

- `X-Timestamp`: Unix seconds. Older than 5 minutes is refused.
- `X-Signature`: hex HMAC-SHA256 of `"<timestamp>.<body>"` with the webhook secret
  (`sha256=` in front is accepted).
- Body: `{ "id": "<event id>", "type": "incident" | "devices", "data": … }`, at most
  256 KB. Each event id is taken once; a repeat gets 409.
- `incident`: `data` is an incident as above.
- `devices`: `data` is `{ "tenant": "<tenant id>", "devices": [device] }`.

Answers: 200 taken, 202 understood but not used (unknown tenant, unknown type),
400 malformed, 401 bad signature or too old, 404 unknown or inactive provider,
409 already received.

## Incidents and escalation

Each incident gets a reference (`SEC-…`) and a "respond by" time from its severity's
target (defaults: critical 15 minutes, high 60, medium 240, low 1440). Medium and above
email the customer's owners and admins when opened. Anything staff do on it counts as
the first response. Incidents nobody answers by their target are escalated every
5 minutes, again each time the target passes, with an email to the escalation address.

## A provider-specific adapter

Once a partner is chosen, add a class implementing `SecurityProviderAdapter` in
`src/server/soc/provider.ts`, a provider type for it, and its tests. Nothing else in
the console changes.
