"use client";

import { useEffect } from "react";
import { campaignVisitAction } from "@/app/(frontend)/[market]/campaign-actions";
import { referralVisitAction } from "@/app/(frontend)/[market]/referral-actions";

/** Counts a visit through a tracked link (one with utm_campaign), and remembers a referral partner's link (?ref=), once per page load. Renders nothing. */
export function CampaignBeacon() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const campaign = q.get("utm_campaign");
    if (campaign) void campaignVisitAction({ campaign, source: q.get("utm_source") ?? undefined, medium: q.get("utm_medium") ?? undefined }).catch(() => undefined);
    const ref = q.get("ref");
    if (ref) void referralVisitAction(ref).catch(() => undefined);
  }, []);
  return null;
}
