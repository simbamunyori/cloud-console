#!/usr/bin/env bash
# Puts the public website on www.fourthgeneration.technology (Milestone 10),
# once its DNS record points at this server. Run as root; safe to run again.
# See docs/launch.md.
#
#   curl -fsSL https://raw.githubusercontent.com/simbamunyori/cloud-console/main/deploy/site-setup.sh | sudo bash
#
# The bare domain, fourthgeneration.technology, stays on the mail and web
# server, which redirects it to www. This script never checks, certifies or
# changes it. It adds the Apache site for www and its certificate, lets Apache
# see visitors' real addresses through Cloudflare, sets SITE_URL in
# /opt/console/.env and restarts the app. The console stays where it is.
set -euo pipefail

SITE_HOST=${SITE_HOST:-www.fourthgeneration.technology}
REPO_RAW=${REPO_RAW:-https://raw.githubusercontent.com/simbamunyori/cloud-console/main}
HOME_DIR=/opt/console
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

[[ $(id -u) -eq 0 ]] || { echo "Run this as root (sudo)."; exit 1; }
[[ -f $HOME_DIR/.env ]] || { echo "$HOME_DIR/.env is missing. Run deploy/server-setup.sh first."; exit 1; }

# Whether an IPv4 address is one of Cloudflare's: with the proxy on, www
# resolves to Cloudflare, which passes visitors on to this server.
cloudflare_ip() {
  python3 - "$1" "$(curl -fsSL https://www.cloudflare.com/ips-v4)" <<'PY'
import ipaddress, sys
ip = ipaddress.ip_address(sys.argv[1])
sys.exit(0 if any(ip in ipaddress.ip_network(r) for r in sys.argv[2].split()) else 1)
PY
}

say "1/5 DNS for $SITE_HOST"
server_ip=$(curl -4fsS https://api.ipify.org || hostname -I | awk '{print $1}')
ip=$(getent ahostsv4 "$SITE_HOST" | awk 'NR==1 {print $1}' || true)
if [[ "$ip" == "$server_ip" ]]; then
  echo "$SITE_HOST points here."
elif [[ -n "$ip" ]] && cloudflare_ip "$ip"; then
  echo "$SITE_HOST goes through the Cloudflare proxy ($ip). Make sure its record points to $server_ip."
else
  echo "$SITE_HOST points to '${ip:-nothing}', not this server ($server_ip)."
  echo "Point the www record here as docs/launch.md says, wait for it to update, then run this again."
  exit 1
fi

say "2/5 Apache site for $SITE_HOST"
a2enmod -q proxy proxy_http headers ssl >/dev/null
curl -fsSL "$REPO_RAW/deploy/apache-site.conf" | sed "s/www\.fourthgeneration\.technology/$SITE_HOST/g" > /etc/apache2/sites-available/site.conf
# An HTTPS copy left by an earlier version of this script, which also served
# the bare domain: certbot writes a fresh one for www alone below.
if [[ -f /etc/apache2/sites-available/site-le-ssl.conf ]]; then
  a2dissite -q site-le-ssl >/dev/null 2>&1 || true
  rm -f /etc/apache2/sites-available/site-le-ssl.conf
fi
a2ensite -q site >/dev/null
apache2ctl configtest
systemctl reload apache2

say "3/5 Certificate for $SITE_HOST"
certbot --apache -d "$SITE_HOST" --cert-name "$SITE_HOST" --redirect --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring

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
  sed -i "s#^SITE_URL=.*#SITE_URL=https://$SITE_HOST#" "$HOME_DIR/.env"
else
  printf '\n# The public website (Milestone 10). Sign-in and the consoles stay on APP_URL.\nSITE_URL=https://%s\n' "$SITE_HOST" >> "$HOME_DIR/.env"
fi
console restart
echo "Done. https://$SITE_HOST is the website; sign-in and the consoles stay on the console's address."
