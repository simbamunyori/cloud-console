"use server";

import { revalidatePath } from "next/cache";
import { requireStaffCan } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { closeQuote, referQuote, saveQuote, sendQuote, type QuoteLineInput } from "@/server/quotes/quotes";

async function deps() {
  const { staff } = await requireStaffCan("manageQuotes");
  return { db: prisma, staff };
}

/** Rows arrive as lines.0.kind, lines.0.description and so on. */
function linesFrom(form: FormData): QuoteLineInput[] {
  const count = Number(field(form, "lineCount")) || 0;
  return Array.from({ length: Math.min(count, 50) }, (_, i) => ({
    kind: field(form, `lines.${i}.kind`),
    description: field(form, `lines.${i}.description`),
    quantity: field(form, `lines.${i}.quantity`),
    unitPrice: field(form, `lines.${i}.unitPrice`),
  }));
}

/** Saves, and with "send" also emails the quote. */
export async function saveQuoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const reference = field(form, "reference");
  const send = field(form, "intent") === "send";
  const d = await deps();
  const result = await run(async () => {
    const { wasSent } = await saveQuote(d, reference, {
      market: field(form, "market"),
      productId: field(form, "productId"),
      message: field(form, "message"),
      validUntil: field(form, "validUntil"),
      lines: linesFrom(form),
    });
    if (send) {
      await sendQuote(d, reference);
      await runSoon("email-deliver").catch(() => undefined);
      return wasSent ? "Saved and sent again. The earlier email's link no longer works." : "Sent. The customer has the quote by email.";
    }
    return wasSent ? "Saved. It was sent before, so send it again for the customer to see the change; the old link no longer works." : "Saved.";
  });
  revalidatePath("/admin/quotes", "layout");
  return result;
}

export async function closeQuoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    await closeQuote(await deps(), field(form, "reference"), field(form, "reason"));
    return "Closed.";
  });
  revalidatePath("/admin/quotes", "layout");
  return result;
}

export async function referQuoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    await referQuote(await deps(), field(form, "reference"));
    await runSoon("email-deliver").catch(() => undefined);
    return "Marked introduced. We've emailed the customer that they'll hear from the partner.";
  });
  revalidatePath("/admin/quotes", "layout");
  return result;
}
