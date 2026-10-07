# Connectivity groundwork

`docs/STRATEGY_ROLLOUT.md`, U12. Everything for selling connectivity is in place but
hidden. Nothing about it reaches visitors or customers until two things are true:

1. the licence for their market is recorded in **Admin > Connectivity**;
2. an Admin has switched on **Connectivity** in **Admin > Features**.

Even then it is offered only in markets with a licence. The "connectivity words" test
still keeps those words out of the site, the seeds and the console, so the products'
own words are placeholders that staff finish in the catalogue.

## What is waiting

The **Connectivity** family is a draft and sold by quote. It holds two categories and
six products, all drafts:

| Product | Category | Unit | Includes |
| --- | --- | --- | --- |
| Connect Office | Connect | per site | |
| Connect Sites | Connect | per site | |
| Connect Cloud | Connect | per link | |
| Connect Standby | Connect | per site | |
| Secure Connected Office | Connected bundles | per site | Connect Office, Connect Standby, managed detection and response, email security |
| Managed Branch Network | Connected bundles | per site | Connect Sites, Connect Cloud, server backup, managed support plan |

What a bundle includes is set in the catalogue, like the U3 inclusions. The live server
adds the products and bundles as drafts when it starts.

## Going live, in order

1. **Admin > Connectivity.** Record the licence for each market where it is granted:
   who granted it, the number and the date. This is in the staff audit log.
2. **Admin > Catalogue.** Finish each product's words and make them **internal**, so our
   own test organisations can try the quote flow.
3. **Admin > Features.** Turn on **Connectivity**. It refuses until a licence is
   recorded.
4. **Admin > Catalogue.** Make the family and the products **live**. The catalogue
   refuses this while Connectivity is off.
5. **Website editor.** Link to `/<market>/quote?for=connect` where it should appear.

Removing the last licence switches Connectivity off by itself.

## The quote request

- **Where customers ask.** Visitors use `/<market>/quote?for=connect`, or the quote
  button on a Connect product. Customers use **Quotes > Connect your offices** in the
  console.
- **What it asks**, besides the usual details:
  - the sites, one per line (town, then address);
  - the speed each site needs;
  - whether they want a standby link, a private link to our servers or Azure, or a
    bundle with managed security and support;
  - when they need it.
- **What happens next.** The request is an ordinary quote. Its words list the sites and
  options, so the quote screens and emails show them. The details are also kept in
  `ConnectivityRequest`. Admin > Connectivity lists the latest requests.
- **Where it isn't offered.** In a market without a licence, or while the switch is off,
  `?for=connect` shows the ordinary quote form and nothing else.
