/**
 * Whether customers can pay by card on this server. The stub card company
 * marks invoices paid for a test card number, so a production server never
 * offers it: card payments stay off there until a real gateway is connected
 * (DPO, PR #3). ALLOW_PLACEHOLDERS=yes keeps it on for demo and CI servers.
 */
export function cardPaymentsOn(e: Record<string, string | undefined> = process.env): boolean {
  if (e.NODE_ENV !== "production") return true;
  if ((e.PAYMENT_ADAPTER || "stub") !== "stub") return true;
  return e.ALLOW_PLACEHOLDERS === "yes";
}
