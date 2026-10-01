"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { field, run, type ActionState } from "@/server/action-state";
import { requireRecentCheck } from "@/server/auth/next";
import { requireBilling } from "@/server/billing/context";
import { setInvoicePo } from "@/server/billing/po";
import { env } from "@/server/env";
import { DomainError } from "@/server/org/access";
import { startCardPayment } from "@/server/payments/card";
import { reportEftPayment } from "@/server/payments/eft";
import { paymentAdapter } from "@/server/payments";

export async function setPoAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { db, billing, organisation, actor } = await requireBilling();
  const invoiceId = field(form, "invoiceId");
  const values = { poNumber: field(form, "poNumber") };
  const result = await run(async () => {
    const po = await setInvoicePo(db, billing, organisation.id, actor, invoiceId, values.poNumber);
    return po ? `Purchase order ${po} saved.` : "Purchase order removed.";
  }, values);
  if (result.ok) revalidatePath(`/app/billing/invoices/${invoiceId}`);
  return result;
}

async function paymentDeps() {
  const { db, billing, organisation, actor } = await requireBilling();
  return { db, billing, organisation, actor, payments: paymentAdapter(), appUrl: env().APP_URL };
}

/** Sends the payer to the card company's page for what is left on the invoice. */
export async function payByCardAction(form: FormData) {
  const invoiceId = field(form, "invoiceId");
  let target = `/app/billing/invoices/${encodeURIComponent(invoiceId)}`;
  await requireRecentCheck((await requireBilling()).session, "CUSTOMER", target);
  try {
    target = (await startCardPayment(await paymentDeps(), invoiceId)).redirectUrl;
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    target += `?card=unavailable`;
  }
  redirect(target);
}

export async function reportEftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const invoiceId = field(form, "invoiceId");
  const values = { amount: field(form, "amount"), paidOn: field(form, "paidOn"), reference: field(form, "reference") };
  const result = await run(async () => {
    await reportEftPayment(await paymentDeps(), invoiceId, values);
    return "Thanks. We'll check our bank account and confirm it within one working day.";
  }, values);
  if (result.ok) revalidatePath(`/app/billing/invoices/${invoiceId}`);
  return result;
}
