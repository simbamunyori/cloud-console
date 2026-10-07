# SOC partner evaluation

A checklist for choosing the provider behind Managed security and the 24/7 SOC
(`docs/STRATEGY_ROLLOUT.md`, U5). Score each candidate from what they confirm in
writing. This document deliberately states no facts about any candidate; fill in
each one's answers from their own material and calls.

## How to score

Score each question 0 (no), 1 (partly, or only on request) or 2 (yes, confirmed in
writing). Multiply by the weight. A 0 on a question marked **must** rules the
candidate out.

| # | Question | Weight | Must |
| --- | --- | --- | --- |
| 1 | **White-label:** can we sell it under our brand, with their name kept off agents, emails, reports and portals customers see? | 3 | must |
| 2 | **API for tenants:** can we create, suspend and remove customer tenants by API? | 3 | |
| 3 | **API for incidents:** do alerts reach us by signed webhook, and can we poll them? | 3 | must |
| 4 | **Devices by API:** device list and health per tenant, and an installer or enrolment link per tenant? | 2 | |
| 5 | **Reports:** a monthly report per tenant we can fetch, white-labelled? | 2 | |
| 6 | **Per-device pricing:** priced per device or user per month, in USD or ZAR, with no setup fee? | 3 | |
| 7 | **Minimums:** minimum devices, spend or contract term, and what happens below it? | 3 | |
| 8 | **Data location:** where telemetry and incident data are stored and processed; does it meet the Botswana Data Protection Act and POPIA? | 3 | must |
| 9 | **Microsoft 365 coverage:** identity, mailbox and tenant threats, not only endpoints? | 2 | |
| 10 | **Google Workspace coverage:** the same for Google Workspace? | 2 | |
| 11 | **Response times:** guaranteed times to triage and contain by severity, 24/7, and what they do for us versus what we do? | 3 | must |
| 12 | **Africa presence:** people, partners or support hours in southern Africa; local billing? | 2 | |
| 13 | **Operating systems:** Windows, macOS and Linux servers covered? | 1 | |
| 14 | **Onboarding:** training, sales material we can rebrand, a sandbox for testing the API? | 1 | |

Record the total, the musts, and anything that needs a provider-specific adapter.

## Candidates

Evaluate each with the table above. Names only; no claims are made here about any of
them.

| Candidate | Score | Musts met | Notes |
| --- | --- | --- | --- |
| Huntress | | | |
| CyberQuell | | | |
| Blackpoint Cyber | | | |
| ArmorPoint | | | |
| CyberGuard360 | | | |
| SOCSoter | | | |
| Layer7 (South Africa) | | | |
| Westcon-Comstor OneSOC | | | |
| ThreatDefence | | | |
| Security vendors through First Distribution | | | |

## After choosing

1. Sign the agreement and get API credentials and a sandbox.
2. If the generic contract in `docs/security-provider.md` fits, use the generic API and
   webhook type. If not, a provider-specific adapter is one small PR.
3. Follow "Going live" in `docs/security-provider.md`.
