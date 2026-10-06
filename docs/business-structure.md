# Business structure in the staff console

`docs/STRATEGY_ROLLOUT.md`, U7. Decisions 211 to 216.

## Units

Admin > Units lists every colleague with tick boxes for their units:

- Sales and pre-sales
- Service delivery
- Customer support
- Operations (NOC and SOC)
- Partnerships and procurement
- Finance and billing
- Marketing
- Product and platform

Staff roles (Support, Provisioning, Finance, Admin) still decide what each person can
change. Units decide which queues they see under **My work**.

## Queues

Each queue is worked by one unit. An Admin can move it in Admin > Units.

| Queue | Usually |
| --- | --- |
| Leads, pre-sales calls, quotes | Sales and pre-sales |
| Setup tasks | Service delivery |
| Tickets | Customer support |
| Security incidents, backup restores | Operations |
| Licence differences, admin access invitations, partner renewals | Partnerships and procurement |
| EFT payments, price approvals | Finance and billing |
| Newsletter drafts, launch kits | Marketing |

## Response targets

Each ticket has a priority (Urgent, High, Normal, Low) and a unit, set by staff on the
ticket page. Targets are minutes to our first reply that the customer sees, and to
"sorted". Until an Admin changes them, the defaults are:

| Priority | First reply | Sorted |
| --- | --- | --- |
| Urgent | 1 hour | 8 hours |
| High | 4 hours | 1 day |
| Normal | 8 hours | 3 days |
| Low | 1 day | 5 days |

Admin > Units shows this month so far and last month: medians and the share within
target, per unit and priority, with the average rating. The ticket page shows each
ticket against its target.

## Published response times and ratings

Both sit behind **Service standards** in Admin > Features, off until switched on.

- On the 2nd of each month at 06:00, last month's figures are saved. A month with at
  least 20 tickets is published on the console's Support page and the help centre,
  by priority, with customer satisfaction.
- When a ticket is sorted, by staff or by the customer, whoever opened it gets one
  email: "How did we do?", 1 to 5. Its links open a page on the website with the score
  chosen; they press a button to send it. They can also answer on the ticket in the
  console, and change it for 30 days.

## Partner register

Admin > Partner register (Admins and anyone with partner rights) keeps:

- each partner's status, category and contacts
- the agreement reference and a link to the signed copy
- the start and renewal dates and the notice period (60 days unless set)
- the catalogue products that depend on it

Every morning at 08:00, Admins are emailed about any agreement whose notice period
starts within two weeks, once per renewal date. Admin > Partners still holds the
encrypted API settings. Partner names never reach customers.
