import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { startScoreFromFreeCheck } from "@/server/tools/results";
import { attributeSignUp, REFERRAL_COOKIE } from "./referrals";

/** After a customer signs up (U9): their referral partner, and their free email check as the score's starting point. Never fails sign-up. */
export async function afterCustomerSignUp(organisationId: string, email: string) {
  try {
    const jar = await cookies();
    await attributeSignUp(prisma, organisationId, jar.get(`__Host-${REFERRAL_COOKIE}`)?.value ?? jar.get(REFERRAL_COOKIE)?.value);
  } catch (e) {
    console.error("Referral not recorded at sign-up:", e instanceof Error ? e.message : e);
  }
  try {
    await startScoreFromFreeCheck(prisma, organisationId, email);
  } catch (e) {
    console.error("Free email check not carried into the score:", e instanceof Error ? e.message : e);
  }
}
