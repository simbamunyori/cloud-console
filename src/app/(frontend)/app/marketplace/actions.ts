"use server";

import { redirect } from "next/navigation";
import { field, run, type ActionState } from "@/server/action-state";
import { requireBilling } from "@/server/billing/context";
import { transferDomainIn } from "@/server/domains/manage";
import { runSoon } from "@/server/jobs/boss";
import { placeOrder, registerDomain } from "@/server/orders/orders";

async function deps() {
  const { db, billing, organisation, actor } = await requireBilling();
  return { db, billing, organisation, actor };
}

export async function placeOrderAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const options: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith("option_") && typeof v === "string") options[k.slice(7)] = v;
  const values = { quantity: field(form, "quantity"), ...Object.fromEntries(Object.entries(options).map(([k, v]) => [`option_${k}`, v])) };
  let reference = "";
  const result = await run(async () => {
    const order = await placeOrder(await deps(), { slug: field(form, "slug"), quantity: values.quantity || "1", options, startNow: form.get("startNow") === "on" });
    reference = order.reference;
  }, values);
  if (!result.ok) return result;
  await runSoon("email-deliver").catch(() => undefined);
  redirect(`/app/orders/${reference}?new=1`);
}

export async function registerDomainAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let reference = "";
  const result = await run(async () => {
    const order = await registerDomain(await deps(), field(form, "domain"), field(form, "years"), form.get("startNow") === "on");
    reference = order.reference;
  });
  if (!result.ok) return result;
  await runSoon("email-deliver").catch(() => undefined);
  redirect(`/app/orders/${reference}?new=1`);
}

export async function transferDomainAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = { domain: field(form, "domain"), authCode: "" };
  let reference = "";
  const result = await run(async () => {
    const order = await transferDomainIn(await deps(), values.domain, field(form, "authCode"), form.get("startNow") === "on");
    reference = order.reference;
  }, values);
  if (!result.ok) return result;
  await runSoon("email-deliver").catch(() => undefined);
  redirect(`/app/orders/${reference}?new=1`);
}
