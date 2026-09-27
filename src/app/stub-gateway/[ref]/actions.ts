"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { field, run, type ActionState } from "@/server/action-state";
import { env } from "@/server/env";
import { stubCancel, stubPay } from "@/server/payments/stub-card";

/** The stub's return URL is absolute, like a real gateway's; we only follow its path, so it can't send anyone elsewhere. */
const pathOf = (url: string) => {
  const u = new URL(url, "http://stub.invalid");
  return `${u.pathname}${u.search}`;
};

export async function stubPayAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (env().PAYMENT_ADAPTER !== "stub") return { error: "The test card page is off." };
  const values = { number: field(form, "number"), expiry: field(form, "expiry") };
  let back = "";
  const result = await run(async () => {
    back = await stubPay(prisma, field(form, "ref"), { ...values, cvc: field(form, "cvc") });
  }, values);
  if (!result.ok) return result;
  redirect(pathOf(back));
}

export async function stubCancelAction(form: FormData) {
  const back = await stubCancel(prisma, field(form, "ref"));
  redirect(back ? pathOf(back) : "/app/billing");
}
