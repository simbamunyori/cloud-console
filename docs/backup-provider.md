# Backup provider: what the console expects

Off-site backup for customers (`docs/STRATEGY_ROLLOUT.md`, U3) is white-label.
An Admin sets the provider up in **Admin > Partners > Backup provider**. Customers
only ever see "Backup" from Fourth Generation Technologies.

## Manual mode (the fallback)

Use it until the provider's API is ready, or if it has none.

1. Admin > Partners > Backup provider: enter the provider's name, choose
   **Manual**, save, press **Test connection**, then **Switch on**.
2. Admin > Features: turn on **Off-site backup in the console**.
3. Each order for a backup product, or a plan that includes one, adds a backup at
   **/admin/backups**. Add backups that predate the console there as well.
4. Record each backup's status, last good copy, retention and coverage from the
   provider's portal. Customers see it at once.
5. A customer's restore request becomes a task in the setup queue and shows under
   **Restores waiting**. Mark it in progress, then done.

## API mode

The console calls the provider's API at the endpoint entered in Partners. Each
request carries:

- `Authorization: Bearer <API key>`
- `X-Api-Secret: <API secret>` if one is saved
- `X-Region: <storage region>` if one is saved
- `X-<name>: <value>` for each custom field (`name=value`, one per line)

| Call | Used for | Answer |
| --- | --- | --- |
| `GET /v1/ping` | Test connection | `{ "account": "…", "protected": 12 }` (both optional) |
| `GET /v1/protections?refs=a,b` | Hourly status, for backups with a provider reference | `{ "protections": [{ "ref", "health", "lastSuccessAt", "lastAttemptAt", "retentionDays", "coverage" }] }` |
| `POST /v1/restores` | A customer's restore | Body `{ "ref", "what", "fromDay", "destination" }`; answer `{ "ref": "…" }` |

`health` is one of `ok`/`success`, `warning`, `failed`/`error`, `pending`; anything
else reads as a warning. Dates are ISO 8601. A 401 or 403 means the key was refused.

Put each backup's provider reference on it at /admin/backups so its status can be
fetched. If the provider's API refuses a restore, the console makes a task instead,
saying why.

When a provider is chosen whose API differs from this, add an adapter for it in
`src/server/backup/provider.ts` next to `ApiBackupProvider`; nothing else changes.
