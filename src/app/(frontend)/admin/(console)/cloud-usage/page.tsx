import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatDay, formatMoment, formatMonth, toDateOnly, todayIn } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { monthsToBill, unbilledUsage, USAGE_TERMS_DAYS } from "@/server/spend/billing";
import { staffCan } from "@/server/staff/access";
import { BillMonthForm, UploadUsageForm } from "./forms";

export const metadata: Metadata = { title: "Azure usage" };

/**
 * Where Azure usage comes in until the distributor's API is signed: staff
 * upload the daily rated usage file, and each row goes to the customer
 * whose subscription it is.
 */
export default async function CloudUsagePage() {
  const { staff } = await requireStaffCan("manageCloudSpend");
  const [imports, subscriptions, months] = await Promise.all([
    prisma.cloudUsageImport.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.cloudSubscription.count(),
    monthsToBill(prisma, todayIn(DEFAULT_TIME_ZONE)),
  ]);
  const toBill = await Promise.all(months.map(async (m) => ({ month: m, customers: await unbilledUsage(prisma, m) })));
  const canBill = staffCan(staff, "billCloudUsage");
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(imports.map((i) => i.importedById))] } }, select: { id: true, name: true } });
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader title="Azure usage" description={`Upload usage for all customers at once, then invoice each month once it has ended. Rows are matched to the ${subscriptions} linked ${subscriptions === 1 ? "subscription" : "subscriptions"}; uploading a day again replaces it.`} />
      <div className="flex flex-col gap-6">
        {toBill.map(({ month, customers }) => (
          <Card key={toDateOnly(month)} aria-labelledby={`bill-${toDateOnly(month)}`}>
            <CardHeader
              id={`bill-${toDateOnly(month)}`}
              title={`${formatMonth(month)} is ready to invoice`}
              description={`Check the last days of ${formatMonth(month)} are uploaded first. Each customer gets one invoice, a line per subscription, due in ${USAGE_TERMS_DAYS} days.`}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-callout">
                <thead className="text-ink-muted">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-2 font-semibold sm:px-6">Customer</th>
                    <th scope="col" className="px-5 py-2 font-semibold sm:px-6">Subscriptions</th>
                    <th scope="col" className="px-5 py-2 text-right font-semibold sm:px-6">Before VAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customers.map((c) => (
                    <tr key={c.organisationId}>
                      <td className="px-5 py-3 text-ink sm:px-6">{c.organisationName}</td>
                      <td className="px-5 py-3 text-ink-muted sm:px-6">{c.subscriptions.map((s) => s.name).join(", ")}</td>
                      <td className="px-5 py-3 text-right text-ink tabular-nums sm:px-6">{formatMoney(money(c.totalMinor, c.currency), "en-BW")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canBill ? (
              <CardBody className="border-t border-border">
                <BillMonthForm month={toDateOnly(month).slice(0, 7)} label={formatMonth(month)} count={customers.length} />
              </CardBody>
            ) : null}
          </Card>
        ))}
        <Card aria-labelledby="upload-title">
          <CardHeader id="upload-title" title="Upload a usage file" description="Customer prices are worked out from each subscription's margin and the month's exchange rate under Pricing." />
          <CardBody>
            <UploadUsageForm />
          </CardBody>
        </Card>
        <Card aria-labelledby="imports-title">
          <CardHeader id="imports-title" title="Recent uploads" />
          {imports.length ? (
            <ul className="divide-y divide-border">
              {imports.map((i) => {
                const notes = (i.notes as string[]) ?? [];
                return (
                  <li key={i.id} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-semibold break-all text-ink">{i.fileName}</span>
                      <Badge tone={notes.length ? "warning" : "positive"}>
                        {i.rowsImported.toLocaleString("en")} of {i.rowsRead.toLocaleString("en")} rows
                      </Badge>
                    </div>
                    <span className="text-callout text-ink-muted">
                      {i.firstDay && i.lastDay ? `${formatDay(i.firstDay, true)} to ${formatDay(i.lastDay, true)}, ` : ""}
                      by {nameOf.get(i.importedById) ?? "staff"}, {formatMoment(i.createdAt, "Africa/Gaborone")}
                    </span>
                    {notes.map((n) => (
                      <span key={n} className="text-callout text-warning">
                        {n}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          ) : (
            <CardBody>
              <p className="text-ink-muted">Nothing uploaded yet.</p>
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
