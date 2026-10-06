# Launch: the website on www.fourthgeneration.technology

Milestone 10. The console already runs at https://console.fourthgeneration.technology. Launch puts the public website on **www.fourthgeneration.technology** and keeps the console host for sign-in and signed-in customers. One app serves both hosts.

The bare domain, **fourthgeneration.technology**, stays on the existing mail and web server. That server already sends every address on it to the same path on www with a permanent (301) redirect, and its DNS does not change. Nothing here checks, certifies or changes it.

What happens where once `SITE_URL` is set:

| Address | Shows |
| --- | --- |
| `www.fourthgeneration.technology` | The website: home, pricing, products, insights, tools, legal pages |
| `fourthgeneration.technology` | The mail and web server sends it to the same path on www |
| `console.fourthgeneration.technology` | Sign-in, sign-up, the customer console (`/app`), the staff console (`/admin`) and the website editor |
| Website pages asked for on the console host | Go to the website on www |
| Sign-in or console pages asked for on the website | Go to the console |
| `www.fourthgeneration.technology/new/...` (the old WordPress site) | The new home page, or the page staff chose at **Staff console > Old site addresses** |

Canonical links, the sitemap, robots.txt, links in emails and sharing images all use `https://www.fourthgeneration.technology`. The domain cart, the chosen country and campaign tracking are shared between www and the console through cookies on `fourthgeneration.technology`. Sign-in stays on the console only.

## Before you start

1. **Old site addresses.** Old links such as `fourthgeneration.technology/new/about` reach www through the bare domain's redirect, keeping the path. List any old page that has a clear new home at **Staff console > Old site addresses** (website Publishers), e.g. `/new/web-hosting` to `/bw/pricing`. Anything not listed under `/new/` opens the home page. `/new/` and `/new/about/`, the two old pages in search results, are already there.
2. **Launch checks.** Open **Staff console > Launch checks** and work through what it lists, in particular the lawyer's approval of the legal pages.

## DNS

Only one record points at this server:

| Type | Name | Content | What |
| --- | --- | --- | --- |
| A | `www` | The server's IP address, the same as the `console` record | The website |

- **Don't change** the `@` record. It stays on the mail and web server, which redirects to www.
- **Don't touch** MX, TXT (SPF, DKIM, DMARC), `autodiscover` or other mail records.
- **Leave** `console` and `billing` as they are.
- **Delete** any AAAA record for `www`, unless the server has an IPv6 address.

To find the server's IP address: `dig +short console.fourthgeneration.technology`, or the Contabo control panel.

## On the server

Once `dig +short www.fourthgeneration.technology` shows the server's IP address, sign in to the server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/simbamunyori/cloud-console/main/deploy/site-setup.sh | sudo bash
```

It checks that www points here, adds the Apache site for www, gets a certificate for www only, lets Apache see visitors' real addresses through Cloudflare, sets `SITE_URL=https://www.fourthgeneration.technology` in `/opt/console/.env` and restarts the app. It is safe to run again, including after the Cloudflare proxy is on.

If the `www` record is in Cloudflare, you can then turn its proxy on (orange cloud), which gives the site the visitor's country (`GEO_COUNTRY_HEADER=cf-ipcountry`). Set **SSL/TLS > Overview** to **Full (strict)** first.

## Check it

1. https://www.fourthgeneration.technology opens the home page for your country.
2. https://fourthgeneration.technology/bw/pricing opens https://www.fourthgeneration.technology/bw/pricing (the mail and web server's redirect).
3. **Sign in** on the website opens https://console.fourthgeneration.technology/sign-in.
4. https://console.fourthgeneration.technology/bw opens https://www.fourthgeneration.technology/bw.
5. https://www.fourthgeneration.technology/new/about opens the home page.
6. Add a domain to the cart on the website, sign in, and open **Cart** in the console: the domain is there.
7. https://www.fourthgeneration.technology/sitemap.xml lists `https://www.fourthgeneration.technology/...` addresses, and the page source of the home page has a canonical link on www.
8. **Staff console > Launch checks** shows "The website opens on its www address" as done.
9. **Search engines:** in Google Search Console, add `https://www.fourthgeneration.technology` and submit its `/sitemap.xml`.

## The launch purchases

The browser test `e2e/purchases.spec.ts` runs on every pull request and goes through the three launch purchases:
- a domain found on the site, then registered from the console cart;
- Microsoft 365 Business Standard, set up by hand from the setup queue;
- a bank transfer reported by the customer and confirmed in EFT payments.

To repeat it on production with a real staff account and a test customer:

1. Create a customer account on the website and order a domain. Staff see the task in **Setup queue**: register it with the registrar, then **Mark as done**.
2. Order Microsoft 365 Business Standard for one user. Set it up in Partner Center, then **Mark as done** with a message to the customer.
3. On the invoice, pay by bank transfer with the invoice number as the reference and press **Tell us you've paid**. When the money arrives, finance press **It's in the bank: confirm** in **EFT payments**.
4. Check the order, service and invoice in WHMCS, then cancel what you don't keep.

## If something goes wrong

- **Undo the website move:** remove `SITE_URL` from `/opt/console/.env`, run `console restart`, and point the `www` record back where it was. The bare domain and the console are unaffected either way.
- **Roll back a release:** `console rollback` (docs/deploy.md).
