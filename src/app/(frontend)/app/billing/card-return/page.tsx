import { redirect } from "next/navigation";
import { requireBilling } from "@/server/billing/context";
import { DomainError } from "@/server/org/access";
import { finishCardPayment } from "@/server/payments/card";
import { paymentAdapter } from "@/server/payments";

/**
 * Where the card company sends the payer back. The outcome is asked of
 * the gateway, never read from this URL, and the invoice is only credited
 * once however often this is loaded. It shows nothing itself: it settles
 * the payment and moves on to the invoice.
 */
export default async function CardReturnPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref = "" } = await searchParams;
  const { db, billing, organisation, actor } = await requireBilling();
  const payment = await db.cardPayment.findFirst({ where: { gatewayRef: ref } });
  if (!payment) redirect("/app/billing");
  let outcome: string;
  try {
    const done = await finishCardPayment({ db, billing, organisation, actor, payments: paymentAdapter() }, ref);
    outcome = done.status === "SUCCEEDED" ? "paid" : done.status === "FAILED" ? "failed" : "pending";
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    outcome = "unapplied";
  }
  redirect(`/app/billing/invoices/${encodeURIComponent(payment.invoiceId)}?card=${outcome}`);
}
