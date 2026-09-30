# Production

The console runs on the Contabo server (Ubuntu 24.04) that also runs WHMCS.

- **Address:** https://console.fourthgeneration.technology (the main domain moves over at launch).
- **Apache** (already serving WHMCS on 80 and 443) passes the console's traffic to the app on `127.0.0.1:3000`. Certificate by certbot.
- **Docker Compose** (`docker-compose.prod.yml`, project name `console`) runs the app, PostgreSQL and the nightly backup.
- **Every push to main that passes CI deploys itself** (`.github/workflows/deploy.yml`).
- **Backups** every night at 23:00 UTC, encrypted, on the server, and off-site once `OFFSITE_S3_*` is set up; a restore is tested every Monday (`.github/workflows/backups.yml`).

On the server everything lives in `/opt/console`:

| Path | What it is |
| --- | --- |
| `.env` | Settings and secrets. Only root and the deploy user can read it |
| `releases/<release>` | The source of the last five releases |
| `current` | The live release |
| `backups/` | Nightly backups (also copied off-site once it is set up) |

## Setting up the server (once)

1. **DNS:** an A record `console` pointing to the server's IP address.
2. **On the server, as root:**
   ```sh
   curl -fsSL https://raw.githubusercontent.com/simbamunyori/cloud-console/main/deploy/server-setup.sh | sudo bash
   ```
   It installs Docker, creates the `deploy` user and its SSH key, writes `/opt/console/.env` with fresh secrets, adds the Apache site, gets the certificate and prints the GitHub secrets. It is safe to run again, e.g. once the DNS record works.
3. **Fill in** the lines marked `FILL IN` in `/opt/console/.env` (`sudo nano /opt/console/.env`), and keep a copy of `BACKUP_PASSPHRASE` in the password manager.
4. **GitHub secrets** (Settings > Secrets and variables > Actions): `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_SSH_KEY`, as printed by the script (and `DEPLOY_PORT` if SSH is not on port 22).
5. **Deploy:** Actions > Deploy > Run workflow (after that, every merge deploys by itself).
6. **The first Admin:** `sudo -u deploy console create-admin "Full Name" you@fourthgeneration.technology`, then sign in at `/admin/sign-in` and set up the authenticator app.
   The first deploy also loads the launch catalogue (families, categories, products and domain endings, once, into a database with no products) and the website editor's first content. Nothing shows a price until staff enter this month's exchange rates and approve the price books at `/admin/pricing`; then `sudo -u deploy console whmcs-sync` shows what WHMCS will get and `console whmcs-sync --apply --staff you@fourthgeneration.technology` puts it there (docs/whmcs-setup.md, section 6).
7. **WHMCS:** allow only this server. In WHMCS, System Settings > General Settings > Security > API IP Access Restriction, and in the console sync addon's Allowed IPs: the server's IP address and `172.30.10.10` (the console's own address inside the server, which is what WHMCS sees because both run on the same machine). Remove the test ranges.

### The settings in `.env`

| Setting | What to put |
| --- | --- |
| `SMTP_URL` | The mail server the console sends from, e.g. `smtps://user:password@mail.example.com:465`. The app does not start without one |
| `SUPPORT_EMAIL` | The support address customers see. Filled into every market on the first start; staff change it per market at `/admin/markets` |
| `WHMCS_API_IDENTIFIER`, `WHMCS_API_SECRET` | The console's API credential (docs/whmcs-setup.md, step 4) |
| `WHMCS_SYNC_SECRET` | The price sync addon's shared secret (docs/whmcs-setup.md, step 6) |
| `OFFSITE_S3_*` | Off-site backup storage. For Cloudflare R2: create a bucket, then an API token with Object Read & Write on it; the endpoint is `https://<account id>.r2.cloudflarestorage.com`. Any S3-compatible storage works: for Contabo Object Storage set `OFFSITE_S3_PROVIDER=Other` and the endpoint from its panel (for example `https://eu2.contabostorage.com`). Optional until real customer data goes in: while the access key is empty, backups stay on the server only and deploys carry on |
| `THEBE_TRY_URL`, `THEBE_URL`, `THEBE_DEMO_URL` | Thebe's trial page, website and demo booking page. Each Thebe button stays hidden until its address is set, and the Expense management menu until `THEBE_URL` is |
| `NSMC_URL` | NSMC's website. The on-site IT line in the home page's team section stays hidden until it is set |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_STAFF_TENANT_ID` | Sign in with Microsoft for customers and staff (docs/sign-in-setup.md, section 1). The buttons stay hidden until set |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google for customers (docs/sign-in-setup.md, section 2) |
| `STAFF_PASSWORD_SIGN_IN` | Optional. `yes` keeps staff passwords working once staff sign in with Microsoft |
| `ANTHROPIC_API_KEY` | Optional. Switches the support assistant on |
| `ADMIN_IP_ALLOWLIST` | Optional. Office addresses allowed to open `/admin` |

The rest are set by the script: `APP_URL`, the generated secrets, `BILLING_ADAPTER=whmcs`, `WHMCS_ENVIRONMENT=production`, `TENANT_PROVIDER=manual`, and `PAYMENT_ADAPTER=stub`, which keeps card payments off in production until the DPO account is live. The app refuses to start while any setting is a development placeholder, and says which.

## How a deploy works

`deploy.yml` runs when CI passes on main. It packs the commit, copies it to the server over SSH as `deploy`, and runs `deploy/deploy.sh`, which:

1. unpacks it into `releases/<release>` and builds the image (the live app keeps serving);
2. takes a backup;
3. applies database migrations and first-start settings;
4. starts the new release and waits up to three minutes for `/api/health` to report it;
5. if it never does, starts the previous release again and fails the workflow, which emails you.

Migrations only add to the database, so the previous release runs on it after a rollback. If one ever can't, restore the backup taken in step 2.

CI rehearses all of this on every pull request (`deploy/rehearse.sh`): a first deploy, creating an Admin, a second deploy, a broken release that rolls back, and a restore.

## Day to day, on the server

As the deploy user (`sudo -u deploy -i`):

```sh
console status                     # live release and health
console logs                       # the app's log
console create-admin "Name" email  # another staff Admin
console whmcs-sync                 # what the approved prices would change in WHMCS (--apply --staff you@... to do it)
console backup                     # a backup now
console restore-test               # prove the newest backup restores (off-site copy once set up)
console releases                   # releases kept on the server
console rollback <release>         # start an earlier release again
```

## Restoring a backup for real

```sh
sudo -u deploy -i
cd /opt/console/current
set -a; . /opt/console/.env; set +a
mkdir -p /tmp/restore && openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE \
  -in /opt/console/backups/console-<time>.tar.enc | tar -C /tmp/restore -xf -
docker compose -p console -f docker-compose.prod.yml stop app
docker compose -p console -f docker-compose.prod.yml exec -T db pg_restore --clean --if-exists --no-owner -U console -d console < /tmp/restore/console.dump
docker compose -p console -f docker-compose.prod.yml run --rm -v /tmp/restore:/restore --entrypoint sh app -c 'tar -C /app/media -xzf /restore/media.tar.gz'
docker compose -p console -f docker-compose.prod.yml start app
```

An off-site copy is downloaded first with `rclone` (or from the Cloudflare dashboard) into `/opt/console/backups`.
