"use server";

import { revalidatePath } from "next/cache";
import { field, run, type ActionState } from "@/server/action-state";
import { requireBilling } from "@/server/billing/context";
import { setInvoicePo } from "@/server/billing/po";

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
