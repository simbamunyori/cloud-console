import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, DetailList } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { company } from "@/config/app";
import { formatMoney, money } from "@/lib/domain/money";
import { requireStaffCan } from "@/server/admin/context";
import { awaitingEft } from "@/server/admin/customers";
import { scopedBilling } from "@/server/billing/scoped";
import { billingAdapter } from "@/server/billing";
import { prisma } from "@/server/db";
import { EftDecision } from "../forms";

export const metadata: Metadata = { title: "EFT payments" };

export default async function PaymentsPage() {
  await requireStaffCan("confirmPayments");
  const reports = await awaitingEft(prisma);
  const invoices = await Promise.all(
    reports.map(async (r) => {
      const billing = await scopedBilling(prisma, billingAdapter(), r.organisationId);
      return billing.getInvoice(r.invoiceId);
    }),
  );

  return (
    <>
      <PageHeader title="EFT payments to check" description="Customers told us they paid by bank transfer. Check each one against the bank statement before confirming. Nothing is credited until you do." />
      {reports.length === 0 ? (
        <EmptyState icon={Wallet} title="Nothing to check">
          When a customer tells us they&apos;ve paid, it shows here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {reports.map((r, i) => {
            const invoice = invoices[i];
            const amount = money(r.amountMinor, r.currency);
            return (
              <Card key={r.id}>
                <CardBody className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1">
                    <Link href={`/admin/customers/${r.organisation.id}`} className="text-callout text-link hover:underline">
                      {r.organisation.name}
                    </Link>
                    <h2 className="text-headline text-ink">
                      {formatMoney(amount, company.staffLocale)} for invoice {invoice?.number ?? r.invoiceId}
                    </h2>
                  </div>
                  <DetailList
                    items={[
                      ["Reference they used", <span key="r" className="font-semibold">{r.reference}</span>],
                      ["Paid on", formatDay(r.paidOn, true)],
                      ["Told us", formatDay(r.createdAt, true)],
                      ["Left on the invoice", invoice ? formatMoney(invoice.balance, company.staffLocale) : "Unknown"],
                    ]}
                  />
                  <EftDecision eftPaymentId={r.id} reported={formatMoney(amount, company.staffLocale)} />
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
