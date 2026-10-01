# Handover: who does what, and where

Everything is managed in the staff console at **https://console.fourthgeneration.technology/admin**. Staff sign in with Microsoft or their password and a second step. Each person sees only the pages their role allows. Every change is recorded in the audit log, and customers see the changes made on their account.

## Roles

| Role | Day to day |
| --- | --- |
| **Support** | Tickets, quotes, leads, pre-sales calls and service status. Reads customer accounts. |
| **Provisioning** | The setup queue: domains, Microsoft 365, Google Workspace and servers set up by hand. Services hosted elsewhere, Azure usage, service status. |
| **Finance** | Confirms bank transfers in EFT payments and invoices Azure usage. |
| **Admin** | Everything above, plus the catalogue, pricing, markets, staff, client migration and launch checks. Admins are also website Publishers. |
| **Website Editor / Publisher** | Given on the Staff page to anyone. Editors change the website, insights and launch kits; Publishers also publish them, approve legal text, send the newsletter and manage old site addresses. |

## Every day

| What | Who | Where |
| --- | --- | --- |
| Set up new orders, then **Mark as done** so the customer is told | Provisioning | Setup queue |
| Confirm bank transfers when the money arrives | Finance | EFT payments |
| Answer tickets and assistant handovers | Support | Tickets |
| Reply to quote requests and leads; pass NSMC requests on | Support | Quotes, Leads |
| Take pre-sales calls | Engineers with hours set | Pre-sales calls |
| Act on tasks for services at Contabo or SiteGround (suspend, unsuspend, cancel) | Provisioning | Setup queue; the customer's page shows where each runs |

## Every month

| What | Who | Where |
| --- | --- | --- |
| Enter the exchange rates for the month | Admin | Pricing |
| Approve next month's prices | Admin | Pricing |
| Upload Azure usage and invoice it | Finance | Azure usage |
| Check and send the newsletter (prepared on the 1st) | Publisher | Newsletter |
| Look at kept Odoo prices due for review | Admin | Client migration |

## When something changes

| What | Who | Where |
| --- | --- | --- |
| Website pages, menus, footer, home page blocks, figures and proof | Editor, then Publisher | Website (the editor) |
| Legal pages: tick **Approved by legal** once the lawyer signs off | Publisher | Website > Legal pages |
| A new product or a price | Admin | Catalogue, then Pricing; set it Live and its launch kit starts |
| Product pages, social posts and the launch email | Editor, then Publisher | Launch kits |
| Old website links that should open a particular page | Publisher | Old site addresses |
| Incidents shown on the status page | Support or Provisioning | Service status |
| Contacts, bank details, tax and the support address per country | Admin | Markets |
| People and their roles; who can edit the website | Admin | Staff |
| Bringing over the remaining Odoo clients | Admin | Client migration (docs/odoo-migration.md) |

## Outside the console

| What | Where | Guide |
| --- | --- | --- |
| Invoices, payments and the billing engine | WHMCS at https://billing.fourthgeneration.technology. Products and prices come from the console; don't change them in WHMCS. | docs/whmcs-setup.md |
| Deploys | Automatic on every merge to main. `console rollback` on the server undoes one. | docs/deploy.md |
| Server, backups and restarts | `console status`, `console backup`, `console restart` on the server | docs/deploy.md |
| DNS for the website, console and mail | Cloudflare | docs/launch.md |
| Microsoft and Google sign-in | Microsoft Entra and Google Cloud | docs/sign-in-setup.md |
| Settings and secrets | `/opt/console/.env` on the server, never in the code | README, Environment variables |

Before customers arrive and after any big change, open **Launch checks**: it lists every placeholder, missing setting and unapproved legal page still left.
