#!/usr/bin/env bash
# One-time set-up of the production server (Ubuntu 24.04, Apache already
# serving WHMCS). Run as root; safe to run again. See docs/deploy.md.
#
#   curl -fsSL https://raw.githubusercontent.com/simbamunyori/cloud-console/main/deploy/server-setup.sh | sudo bash
#
# It installs Docker, creates the "deploy" user GitHub Actions signs in as,
# writes /opt/console/.env with fresh secrets (you fill in the rest),
# adds the Apache site for the console and its certificate, and prints the
# three GitHub secrets to add.
set -euo pipefail

DOMAIN=${DOMAIN:-console.fourthgeneration.technology}
REPO_RAW=${REPO_RAW:-https://raw.githubusercontent.com/simbamunyori/cloud-console/main}
HOME_DIR=/opt/console
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

[[ $(id -u) -eq 0 ]] || { echo "Run this as root (sudo)."; exit 1; }

say "1/6 Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null
docker compose version

say "2/6 The deploy user"
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
if [[ ! -f /home/deploy/.ssh/github_actions ]]; then
  sudo -u deploy ssh-keygen -q -t ed25519 -N '' -C "github-actions@cloud-console" -f /home/deploy/.ssh/github_actions
fi
pub=$(cat /home/deploy/.ssh/github_actions.pub)
touch /home/deploy/.ssh/authorized_keys
grep -qF "$pub" /home/deploy/.ssh/authorized_keys || echo "no-port-forwarding,no-X11-forwarding,no-agent-forwarding $pub" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
if sshd -T 2>/dev/null | grep -qiE '^allowusers '; then
  echo "NOTE: sshd has AllowUsers set. Add deploy to it in /etc/ssh/sshd_config, then: systemctl reload ssh"
fi

say "3/6 /opt/console and its settings"
install -d -o deploy -g deploy "$HOME_DIR" "$HOME_DIR/releases" "$HOME_DIR/backups" "$HOME_DIR/incoming"
if [[ ! -f $HOME_DIR/.env ]]; then
  rand() { openssl rand -base64 32; }
  cat > "$HOME_DIR/.env" <<ENV
# Production settings for the console. Fill in every line marked FILL IN,
# then save. Never commit or share this file. docs/deploy.md explains each.

APP_URL=https://$DOMAIN
DOMAIN=$DOMAIN
CONSOLE_NAME=Cloud Console

# Made by server-setup.sh. Leave as they are.
POSTGRES_PASSWORD=$(openssl rand -hex 24)
TOTP_ENCRYPTION_KEY=$(rand)
PAYLOAD_SECRET=$(rand)
# Encrypts every backup. Also keep a copy in your password manager:
# without it no backup can be restored.
BACKUP_PASSPHRASE=$(openssl rand -hex 32)

# FILL IN: the mail server the console sends from, e.g.
# smtps://user:password@mail.fourthgeneration.technology:465
SMTP_URL=
MAIL_FROM="Fourth Generation Technologies <no-reply@fourthgeneration.technology>"

# FILL IN: the support address customers see (every market; staff can
# change it per market later at /admin/markets).
SUPPORT_EMAIL=

# WHMCS on this server. FILL IN the credential and the sync secret
# (WHMCS: System Settings > API Credentials, and the addon's settings).
BILLING_ADAPTER=whmcs
WHMCS_ENVIRONMENT=production
WHMCS_API_URL=https://billing.fourthgeneration.technology/includes/api.php
WHMCS_API_IDENTIFIER=
WHMCS_API_SECRET=
WHMCS_SYNC_SECRET=

# Licence changes reach staff as tasks until the vendor APIs are connected.
TENANT_PROVIDER=manual
# Card payments stay off in production until the DPO account is approved.
PAYMENT_ADAPTER=stub

# Optional until real customer data goes in: off-site backup storage (any
# S3-compatible storage). While the access key is empty, nightly backups
# stay on this server only and everything else works.
# Contabo Object Storage: OFFSITE_S3_PROVIDER=Other and the endpoint from
# the Object Storage panel (for example https://eu2.contabostorage.com).
# R2: Cloudflare dashboard > R2 > Create bucket, then Manage API tokens >
# Create API token with Object Read & Write on that bucket.
OFFSITE_S3_PROVIDER=Cloudflare
OFFSITE_S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
OFFSITE_S3_BUCKET=fgt-console-backups
OFFSITE_S3_ACCESS_KEY_ID=
OFFSITE_S3_SECRET_ACCESS_KEY=

# Optional: Bank of Botswana's daily rates and the monthly price book
# (docs/exchange-rates.md). A free key from https://allratestoday.com.
ALLRATESTODAY_API_KEY=

# Optional: switches the support assistant on.
ANTHROPIC_API_KEY=
# Optional: office addresses allowed to open /admin (empty allows any).
ADMIN_IP_ALLOWLIST=
GEO_COUNTRY_HEADER=cf-ipcountry
ENV
  chown deploy:deploy "$HOME_DIR/.env"
  chmod 600 "$HOME_DIR/.env"
  echo "Wrote $HOME_DIR/.env"
else
  echo "$HOME_DIR/.env is already there; left as it is."
fi
ln -sfn "$HOME_DIR/current/deploy/console" /usr/local/bin/console

say "4/6 Apache site for $DOMAIN"
a2enmod -q proxy proxy_http headers ssl >/dev/null
curl -fsSL "$REPO_RAW/deploy/apache-console.conf" | sed "s/console\.fourthgeneration\.technology/$DOMAIN/" > /etc/apache2/sites-available/console.conf
a2ensite -q console >/dev/null
apache2ctl configtest
systemctl reload apache2
# WHMCS on this server allows the console by its container address.
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow from 172.30.10.0/24 to any port 443 proto tcp >/dev/null
fi

say "5/6 Certificate"
server_ip=$(curl -4fsS https://api.ipify.org || hostname -I | awk '{print $1}')
dns_ip=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)
if [[ "$dns_ip" == "$server_ip" ]]; then
  certbot --apache -d "$DOMAIN" --redirect --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
else
  echo "$DOMAIN points to '${dns_ip:-nothing}', not this server ($server_ip)."
  echo "Add the DNS record, wait a few minutes, then run this script again."
fi

say "6/6 GitHub secrets"
ssh_port=$(sshd -T 2>/dev/null | awk '/^port / {print $2; exit}')
host_key=$(awk '{print $1" "$2}' /etc/ssh/ssh_host_ed25519_key.pub)
if [[ "${ssh_port:-22}" == "22" ]]; then known="$server_ip $host_key"; else known="[$server_ip]:$ssh_port $host_key"; fi
cat <<OUT
Add these at GitHub > simbamunyori/cloud-console > Settings > Secrets and
variables > Actions > New repository secret:

DEPLOY_HOST
$server_ip
$( [[ "${ssh_port:-22}" != "22" ]] && printf '\nDEPLOY_PORT\n%s\n' "$ssh_port" )

DEPLOY_KNOWN_HOSTS
$known

DEPLOY_SSH_KEY  (everything between the lines, including BEGIN and END)
----------------------------------------------------------------------
$(cat /home/deploy/.ssh/github_actions)
----------------------------------------------------------------------

The WHMCS API and the sync addon should allow only this server:
  $server_ip and 172.30.10.10 (the console's address inside this server)

Next: fill in the FILL IN lines with   sudo nano $HOME_DIR/.env
OUT
