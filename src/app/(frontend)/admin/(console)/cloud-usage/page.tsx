import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay, formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { UploadUsageForm } from "./forms";

export const metadata: Metadata = { title: "Azure usage" };

/**
 * Where Azure usage comes in until the distributor's API is signed: staff
 * upload the daily rated usage file, and each row goes to the customer
 * whose subscription it is.
 */
export default async function CloudUsagePage() {
  await requireStaffCan("manageCloudSpend");
  const [imports, subscriptions] = await Promise.all([
    prisma.cloudUsageImport.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.cloudSubscription.count(),
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(imports.map((i) => i.importedById))] } }, select: { id: true, name: true } });
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  return (
    <>
      <PageHeader title="Azure usage" description={`Upload usage for all customers at once. Rows are matched to the ${subscriptions} linked ${subscriptions === 1 ? "subscription" : "subscriptions"}; uploading a day again replaces it.`} />
      <div className="flex flex-col gap-6">
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
