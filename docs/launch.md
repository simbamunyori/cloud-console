# Launch: the website on fourthgeneration.technology

Milestone 10. The console already runs at https://console.fourthgeneration.technology. Launch puts the public website on **fourthgeneration.technology**, sends **www** to it, and keeps the console host for sign-in and signed-in customers. One app serves both hosts.

What happens where once `SITE_URL` is set:

| Address | Shows |
| --- | --- |
| `fourthgeneration.technology` | The website: home, pricing, products, insights, tools, legal pages |
| `www.fourthgeneration.technology` | Goes to the same page without www |
| `console.fourthgeneration.technology` | Sign-in, sign-up, the customer console (`/app`), the staff console (`/admin`) and the website editor |
| Website pages asked for on the console host | Go to the website |
| Sign-in or console pages asked for on the website | Go to the console |
| `fourthgeneration.technology/new/...` (the old WordPress site) | The new home page, or the page staff chose at **Staff console > Old site addresses** |

The domain cart, the chosen country and campaign tracking are shared between the two hosts. Sign-in stays on the console only.

## Before you change DNS

1. **Old site addresses.** If the old WordPress site is still up, open its sitemap (`/new/sitemap_index.xml` or `/new/sitemap.xml`) and list any page that has a clear new home. Add each at **Staff console > Old site addresses** (website Publishers), e.g. `/new/web-hosting` to `/bw/pricing`. Anything not listed under `/new/` opens the home page. `/new/` and `/new/about/`, the two old pages in search results, are already there.
2. **A copy of the old site.** Once DNS moves, the old site can no longer be reached by its name. Keep a backup with its host if you may need anything from it.
3. **Launch checks.** Open **Staff console > Launch checks** and work through what it lists, in particular the lawyer's approval of the legal pages.

## The DNS changes

Where the domain's DNS is managed (Cloudflare), for `fourthgeneration.technology`:

| Type | Name | Content | Proxy | What |
| --- | --- | --- | --- | --- |
| A | `@` | The server's IP address, the same as the `console` record | DNS only (grey) at first | The website |
| A | `www` | The same IP address | DNS only (grey) at first | Goes to the website |

- **Change** the existing `@` and `www` records; don't add second ones. If `www` is a CNAME, delete it and add the A record.
- **Delete** any AAAA record for `@` or `www`, unless the server has an IPv6 address.
- **Don't touch** MX, TXT (SPF, DKIM, DMARC), `autodiscover` or other mail records. Email keeps working as it is.
- **Leave** `console` and `billing` as they are.

To find the server's IP address: `dig +short console.fourthgeneration.technology`, or the Contabo control panel.

## On the server, once DNS has updated

Wait until `dig +short fourthgeneration.technology` and `dig +short www.fourthgeneration.technology` both show the server's IP address. Then, signed in to the server:

```bash
curl -fsSL https://raw.githubusercontent.com/simbamunyori/cloud-console/main/deploy/site-setup.sh | sudo bash
```

It checks DNS, adds the Apache site for both names, gets their certificate, lets Apache see visitors' real addresses through Cloudflare, sets `SITE_URL=https://fourthgeneration.technology` in `/opt/console/.env` and restarts the app. It is safe to run again.

Then, in Cloudflare:

1. Turn the proxy on (orange cloud) for `@` and `www`. This is what gives the site the visitor's country (`GEO_COUNTRY_HEADER=cf-ipcountry`).
2. **SSL/TLS > Overview:** set the mode to **Full (strict)**.

## Check it

1. https://www.fourthgeneration.technology opens https://fourthgeneration.technology.
2. https://fourthgeneration.technology opens the home page for your country.
3. **Sign in** on the website opens https://console.fourthgeneration.technology/sign-in.
4. https://console.fourthgeneration.technology/bw opens https://fourthgeneration.technology/bw.
5. https://fourthgeneration.technology/new/about opens the home page.
6. Add a domain to the cart on the website, sign in, and open **Cart** in the console: the domain is there.
7. https://fourthgeneration.technology/sitemap.xml lists `https://fourthgeneration.technology/...` addresses.
8. **Search engines:** in Google Search Console, add `fourthgeneration.technology` and submit `https://fourthgeneration.technology/sitemap.xml`.

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

- **Undo the website move:** remove `SITE_URL` from `/opt/console/.env`, run `console restart`, and point the `@` and `www` records back where they were. The console is unaffected either way.
- **Roll back a release:** `console rollback` (docs/deploy.md).
