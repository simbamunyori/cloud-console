import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { PARTNER_CATEGORIES, PARTNER_STATUS_LABEL, partnerRegister } from "@/server/units/partner-register";
import { PARTNER_TASK_KINDS, renewalsDue } from "@/server/units/units";
import { PartnerRecordForm, type PartnerRecordValues } from "./forms";

export const metadata: Metadata = { title: "Partner register" };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const TONE = { PROSPECT: "info", ACTIVE: "positive", PAUSED: "warning", ENDED: "neutral" } as const;

/** Every partner we depend on (U7): status, contacts, agreements, renewal dates and dependent products. Staff only. */
export default async function PartnerRegisterPage() {
  await requireStaffCan("managePartners");
  const now = new Date();
  const [records, due, tasks] = await Promise.all([
    partnerRegister(prisma),
    renewalsDue(prisma, now),
    prisma.provisioningTask.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, kind: { in: PARTNER_TASK_KINDS } } }),
  ]);
  const categories = PARTNER_CATEGORIES.map((c) => ({ value: c, label: c }));
  const statuses = Object.entries(PARTNER_STATUS_LABEL).map(([value, label]) => ({ value, label }));
  const values = (r: (typeof records)[number]): PartnerRecordValues => ({
    id: r.id,
    name: r.name,
    category: r.category,
    status: r.status,
    contacts: r.contacts ?? "",
    agreementRef: r.agreementRef ?? "",
    agreementUrl: r.agreementUrl ?? "",
    startsOn: iso(r.startsOn),
    renewsOn: iso(r.renewsOn),
    noticeDays: String(r.noticeDays),
    products: r.products.join(", "),
    notes: r.notes ?? "",
  });

  return (
    <>
      <PageHeader
        title="Partner register"
        description="Everyone we depend on to deliver: distributors, licensing, security and backup providers, registrars and data centres. Admins are emailed two weeks before an agreement's notice period starts. Customers never see this."
      />
      <div className="flex flex-col gap-6">
        {due.length || tasks ? (
          <Card aria-labelledby="due-title">
            <CardHeader id="due-title" title="Needs attention" />
            <CardBody className="flex flex-col gap-2">
              {due.map((r) => (
                <p key={r.id} className="text-ink">
                  <span className="font-semibold">{r.name}</span> renews on {formatDay(r.renewsOn!, true)}. Decide by {formatDay(new Date(r.renewsOn!.getTime() - r.noticeDays * 86_400_000), true)}.
                </p>
              ))}
              {tasks ? (
                <p className="text-ink">
                  {tasks} licence {tasks === 1 ? "difference or access invitation is" : "differences or access invitations are"} open in the{" "}
                  <Link href="/admin/tasks" className="text-link underline underline-offset-2">
                    setup queue
                  </Link>
                  .
                </p>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        <Card aria-labelledby="add-title">
          <CardHeader id="add-title" title="Add a partner" />
          <CardBody>
            <PartnerRecordForm record={{ name: "", category: "", status: "", contacts: "", agreementRef: "", agreementUrl: "", startsOn: "", renewsOn: "", noticeDays: "60", products: "", notes: "" }} categories={categories} statuses={statuses} />
          </CardBody>
        </Card>

        {records.length ? (
          <Card aria-labelledby="register-title">
            <CardHeader id="register-title" title={`Partners (${records.length})`} />
            <ul className="divide-y divide-border">
              {records.map((r) => (
                <li key={r.id}>
                  <details className="group px-5 py-4 sm:px-6">
                    <summary className="flex cursor-pointer flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold text-ink">{r.name}</span>
                        <span className="text-callout text-ink-muted">
                          {r.category}
                          {r.renewsOn ? `, renews ${formatDay(r.renewsOn, true)}` : ""}
                          {r.products.length ? `, ${r.products.length} ${r.products.length === 1 ? "product" : "products"}` : ""}
                        </span>
                      </span>
                      <Badge tone={TONE[r.status]}>{PARTNER_STATUS_LABEL[r.status]}</Badge>
                    </summary>
                    <div className="mt-4 flex flex-col gap-4">
                      {r.agreementUrl ? (
                        <a href={r.agreementUrl} target="_blank" rel="noreferrer" className="self-start text-callout text-link underline underline-offset-2">
                          Open the agreement
                        </a>
                      ) : null}
                      <PartnerRecordForm record={values(r)} categories={categories} statuses={statuses} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
