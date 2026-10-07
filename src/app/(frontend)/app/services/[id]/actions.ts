"use server";

import { revalidatePath } from "next/cache";
import { toJson, type MoneyJson } from "@/lib/domain/money";
import { field, run, type ActionState } from "@/server/action-state";
import { requireRecentCheck } from "@/server/auth/next";
import { requireBilling } from "@/server/billing/context";
import { runSoon } from "@/server/jobs/boss";
import { changeQuantity, previewQuantityChange } from "@/server/orders/orders";

export interface QuantityState extends ActionState {
  preview?: { from: number; to: number; unitPrice: MoneyJson; newRecurring: MoneyJson; dueNow: MoneyJson; daysLeft: number };
  reference?: string;
}

/** Shows what a change costs first ("preview"), then makes it ("confirm"). */
export async function changeQuantityAction(_prev: QuantityState, form: FormData): Promise<QuantityState> {
  const { db, billing, organisation, actor, session } = await requireBilling();
  const deps = { db, billing, organisation, actor };
  const serviceId = field(form, "serviceId");
  const quantity = field(form, "quantity");
  const values = { quantity };

  if (field(form, "intent") === "confirm") {
    await requireRecentCheck(session, "CUSTOMER", `/app/services/${encodeURIComponent(serviceId)}`);
    let reference = "";
    let automatic = false;
    const result = await run(async () => {
      const done = await changeQuantity(deps, serviceId, quantity);
      reference = done.order.reference;
      automatic = done.automatic;
    }, values);
    if (!result.ok) return result;
    await runSoon("email-deliver").catch(() => undefined);
    revalidatePath(`/app/services/${serviceId}`);
    return { ok: true, reference, message: automatic ? "Done. The licences are updated." : "Done. We've recorded the change and will update the licences." };
  }

  let preview: QuantityState["preview"];
  const result = await run(async () => {
    const c = await previewQuantityChange(deps, serviceId, quantity);
    preview = { from: c.from, to: c.to, unitPrice: toJson(c.unitPrice), newRecurring: toJson(c.preview.newRecurring), dueNow: toJson(c.preview.dueNow), daysLeft: c.preview.daysLeft };
  }, values);
  return result.ok ? { preview, values } : result;
}
