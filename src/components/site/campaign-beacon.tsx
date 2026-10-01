"use client";

import { useEffect } from "react";
import { campaignVisitAction } from "@/app/(frontend)/[market]/campaign-actions";

/** Counts a visit through a tracked link (one with utm_campaign), once per page load. Renders nothing. */
export function CampaignBeacon() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const campaign = q.get("utm_campaign");
    if (campaign) void campaignVisitAction({ campaign, source: q.get("utm_source") ?? undefined, medium: q.get("utm_medium") ?? undefined }).catch(() => undefined);
  }, []);
  return null;
}
