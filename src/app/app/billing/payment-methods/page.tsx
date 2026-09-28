import { ArrowLeft, CreditCard, Landmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BankDetailsList } from "@/components/billing/bank-details";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireBilling } from "@/server/billing/context";
import { eftDetails } from "@/server/markets/markets";

export const metadata: Metadata = { title: "Payment methods" };

export default async function PaymentMethodsPage() {
  const { billing, market } = await requireBilling();
  const methods = await billing.listPayMethods();
  const bank = eftDetails(market);

  return (
    <>
      <Link href="/app/billing" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Billing
      </Link>
      <PageHeader title="Payment methods" description="How you pay your invoices. We never see or keep your full card number; the card company keeps it for us." />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="cards-title">
          <CardHeader id="cards-title" title="Saved cards" />
          {methods.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No cards saved. You can save one when you next pay an invoice by card.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {methods.map((m) => (
                <li key={m.payMethodId} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                  {m.kind === "card" ? <CreditCard aria-hidden className="size-5 text-ink-muted" /> : <Landmark aria-hidden className="size-5 text-ink-muted" />}
                  <span className="flex flex-1 flex-col">
                    <span className="text-ink">{m.description}</span>
                    {m.expiry ? <span className="text-callout text-ink-muted">Expires {m.expiry}</span> : null}
                  </span>
                  {m.isDefault ? <Badge tone="info">Used first</Badge> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="eft-title">
          <CardHeader id="eft-title" title="Bank transfer (EFT)" description="Pay any invoice from your bank with the invoice number as the reference. We confirm it within one working day." />
          <CardBody>{bank ? <BankDetailsList bank={bank} /> : <p className="text-ink-muted">Our bank details will appear here soon. Until then, contact support to pay by EFT.</p>}</CardBody>
        </Card>
      </div>
    </>
  );
}
