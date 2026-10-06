# Success dashboard

`docs/STRATEGY_ROLLOUT.md`, U8. Decisions 217 to 221.

**Admin > Success** is for Admins only. It shows how the business is doing against
targets they set. The figures are worked out every night at 05:00; **Refresh now**
works them out straight away.

## The figures

| Figure | What it counts |
| --- | --- |
| Managed customers | Customers with at least one active service beyond hosting: cloud and productivity, security and SOC, resilience and compliance, or business apps |
| Net new managed customers | Managed customers who joined this month, less those who left, compared with last month's list |
| Revenue from managed customers | Their recurring revenue a month |
| Share of revenue from managed customers | Against all recurring revenue |
| Leads | Leads that came in during the month |
| Leads that became customers | Of the month's leads, those whose email belongs to a customer who has ordered |
| First replies within target | The units' response targets from Admin > Units, across all tickets opened that month |
| Customer satisfaction | The average "How did we do?" rating that month (needs Service standards on) |
| Average security score | Across customers with a score |

Each figure shows **On track** when it's at or above its target, **Behind** when it's
below, or **No target**.

## Revenue by pillar

Recurring revenue is read from billing for each customer's active services:

- A quarterly, six-monthly or yearly service counts as its monthly share.
- Other currencies are converted at the latest exchange rate in Pricing.
- Customers whose services can't be read, and amounts with no rate, are left out and
  listed.

Each product counts under one pillar, by its catalogue category:

| Category | Pillar |
| --- | --- |
| Productivity, Public cloud, Servers, Plans, Services | Cloud and productivity |
| Protection: email security, detection and response | Security and SOC |
| Protection: backup, disaster recovery, archiving, local copy | Resilience and compliance |
| Web and domains | Digital growth (hosting) |
| Our software | Business apps |

**Hosting-only revenue** comes from customers whose services are all web and domains.
Domains themselves are billed yearly through billing's domains and aren't counted.

## The directors' email

In Admin > Success, enter the targets and the directors' email addresses. Then turn
on **Monthly success email to the directors** in Admin > Features. On the 1st of each
month at 07:00, last month's figures are worked out once more and emailed, once. The
email lists anything behind target first, then every figure, revenue by pillar and
leads by source.
