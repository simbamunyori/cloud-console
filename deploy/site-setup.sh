#!/usr/bin/env bash
# Puts the public website on fourthgeneration.technology and www (Milestone
# 10), once their DNS records point at this server. Run as root; safe to run
# again. See docs/launch.md.
#
#   curl -fsSL https://raw.githubusercontent.com/simbamunyori/cloud-console/main/deploy/site-setup.sh | sudo bash
#
# It adds the Apache site and its certificate, lets Apache see visitors'
# real addresses through Cloudflare, sets SITE_URL in /opt/console/.env and
# restarts the app. The console stays where it is.
set -euo pipefail

SITE_DOMAIN=${SITE_DOMAIN:-fourthgeneration.technology}
REPO_RAW=${REPO_RAW:-https://raw.githubusercontent.com/simbamunyori/cloud-console/main}
HOME_DIR=/opt/console
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

[[ $(id -u) -eq 0 ]] || { echo "Run this as root (sudo)."; exit 1; }
[[ -f $HOME_DIR/.env ]] || { echo "$HOME_DIR/.env is missing. Run deploy/server-setup.sh first."; exit 1; }

say "1/5 DNS"
server_ip=$(curl -4fsS https://api.ipify.org || hostname -I | awk '{print $1}')
for name in "$SITE_DOMAIN" "www.$SITE_DOMAIN"; do
  ip=$(getent ahostsv4 "$name" | awk 'NR==1 {print $1}' || true)
  if [[ "$ip" != "$server_ip" ]]; then
    echo "$name points to '${ip:-nothing}', not this server ($server_ip)."
    echo "Change the DNS records as docs/launch.md says (Cloudflare proxy off until this has run),"
    echo "wait for them to update, then run this again."
    exit 1
  fi
  echo "$name points here."
done

say "2/5 Apache site for $SITE_DOMAIN and www.$SITE_DOMAIN"
a2enmod -q proxy proxy_http headers ssl >/dev/null
curl -fsSL "$REPO_RAW/deploy/apache-site.conf" | sed "s/fourthgeneration\.technology/$SITE_DOMAIN/g" > /etc/apache2/sites-available/site.conf
a2ensite -q site >/dev/null
apache2ctl configtest
systemctl reload apache2

say "3/5 Certificate"
certbot --apache -d "$SITE_DOMAIN" -d "www.$SITE_DOMAIN" --redirect --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring

say "4/5 Visitors' addresses through Cloudflare"
# With the Cloudflare proxy on, Apache sees Cloudflare's address. Trust
# CF-Connecting-IP from Cloudflare's own ranges only, so rate limits and the
# /admin allowlist see the real visitor (Apache passes it on in X-Forwarded-For).
a2enmod -q remoteip >/dev/null
{
  echo "# Written by deploy/site-setup.sh from https://www.cloudflare.com/ips/. Run it again to refresh."
  echo "RemoteIPHeader CF-Connecting-IP"
  for range in $(curl -fsSL https://www.cloudflare.com/ips-v4) $(curl -fsSL https://www.cloudflare.com/ips-v6); do
    echo "RemoteIPTrustedProxy $range"
  done
} > /etc/apache2/conf-available/cloudflare-remoteip.conf
a2enconf -q cloudflare-remoteip >/dev/null
apache2ctl configtest
systemctl reload apache2

say "5/5 SITE_URL and restart"
if grep -q '^SITE_URL=' "$HOME_DIR/.env"; then
  sed -i "s#^SITE_URL=.*#SITE_URL=https://$SITE_DOMAIN#" "$HOME_DIR/.env"
else
  printf '\n# The public website (Milestone 10). Sign-in and the consoles stay on APP_URL.\nSITE_URL=https://%s\n' "$SITE_DOMAIN" >> "$HOME_DIR/.env"
fi
console restart
echo "Done. https://$SITE_DOMAIN is the website; https://www.$SITE_DOMAIN goes to it."
