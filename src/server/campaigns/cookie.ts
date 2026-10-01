import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { CAMPAIGN_COOKIE, decodeTouch, recordCampaign } from "./campaigns";
import type { CampaignEventKind } from "@prisma/client";

/** The campaign this browser arrived through, if a tracked link brought it here in the last 30 days. */
export async function currentTouch() {
  const jar = await cookies();
  return decodeTouch(jar.get(`__Host-${CAMPAIGN_COOKIE}`)?.value ?? jar.get(CAMPAIGN_COOKIE)?.value);
}

/** Counts a lead, quote request or sign-up towards the browser's campaign. Never fails the caller. */
export async function countForCampaign(kind: CampaignEventKind, ref: string) {
  try {
    await recordCampaign(prisma, await currentTouch(), kind, ref);
  } catch (e) {
    console.error("Campaign event not recorded:", e instanceof Error ? e.message : e);
  }
}
