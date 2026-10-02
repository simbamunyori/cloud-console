import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DetailList, Stat } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { company, DEFAULT_TIME_ZONE } from "@/config/app";
import { formatDay, formatMoment, parseDateOnly, todayIn, toDateOnly } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import { requireStaffCan } from "@/server/admin/context";
import { PRICE_PER } from "@/server/billing/views";
import { isLegacyCategory } from "@/server/catalogue/legacy";
import { DOMAIN_PRODUCT_SLUG } from "@/server/catalogue/seed-data";
import { effectiveStatus } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { ODOO_FILES } from "@/server/migration/odoo";
import type { PlanReport } from "@/server/migration/plan";
import { HOST_LABEL, legacyReviewsDue } from "@/server/migration/services";
import { ROLE_LABEL } from "@/server/org/access";
import { ApproveForm, CarryOnForm, CutoverForm, ProductChoices, UploadForm } from "./forms";

export const metadata: Metadata = { title: "Client migration" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  REVIEW: { label: "Dry run, waiting for approval", tone: "info" },
  APPROVED: { label: "Approved, starting", tone: "info" },
  IMPORTING: { label: "Importing", tone: "info" },
  IMPORTED: { label: "Imported", tone: "positive" },
  FAILED: { label: "Stopped", tone: "negative" },
};

const FILE_LABEL = Object.fromEntries(ODOO_FILES.map((f) => [f.key, f.label.toLowerCase()]));

export default async function MigrationPage() {
  await requireStaffCan("migrateClients");
  const today = todayIn(DEFAULT_TIME_ZONE);
  const [batch, products, reviews] = await Promise.all([
    prisma.migrationBatch.findFirst({ where: { status: { not: "DISCARDED" } }, orderBy: { createdAt: "desc" } }),
    prisma.product.findMany({ include: { category: { include: { family: true } } }, orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }] }),
    legacyReviewsDue(prisma, today),
  ]);
  const report = batch ? (batch.report as unknown as PlanReport) : null;
  const unfinished = batch?.status === "FAILED" ? await prisma.migrationRecord.findMany({ where: { batchId: batch.id, targetId: null } }) : [];
  const people = batch?.status === "IMPORTED" ? await prisma.migrationRecord.count({ where: { batchId: batch.id, kind: "person" } }) : 0;
  const fmt = (minor: string, currency: string) => formatMoney(money(BigInt(minor), currency), company.staffLocale);
  const perCurrency = (m: Record<string, string>) => Object.entries(m).map(([c, v]) => fmt(v, c)).join(", ") || "None";
  const choices = [
    { value: "legacy", label: "Legacy services (no catalogue product)" },
    ...products.filter((p) => p.slug !== DOMAIN_PRODUCT_SLUG && !isLegacyCategory(p.categoryKey) && effectiveStatus(p, p.category.family) !== "DRAFT").map((p) => ({ value: p.slug, label: `${p.name} (${p.category.name})` })),
  ];
  const offsiteMissing = !env().OFFSITE_S3_BUCKET;

  return (
    <>
      <PageHeader
        title="Client migration"
        description="Brings existing clients over from Odoo at the prices and due dates they have now. Nothing is written until you approve the dry run, and nobody is emailed until the cutover date you choose."
      />
      <div className="flex flex-col gap-6">
        {offsiteMissing ? (
          <Alert tone="warning">Off-site backups are still off. Add Contabo Object Storage (the OFFSITE_S3_ settings) before importing real customer data, so a copy lives away from this server.</Alert>
        ) : null}

        <Card aria-labelledby="upload-title">
          <CardHeader
            id="upload-title"
            title={batch ? "Upload new exports" : "Upload the Odoo exports"}
            description="Export each list from Odoo as CSV with the fields in the guide, and upload them together. A new upload replaces a dry run that hasn't been approved."
          />
          <CardBody className="flex flex-col gap-5">
            <p className="text-callout text-ink-muted">
              Example files:{" "}
              {ODOO_FILES.map((f, i) => (
                <span key={f.key}>
                  {i ? ", " : ""}
                  <a href={`/admin/migration/templates/${f.key}.csv`} className="text-link underline underline-offset-2">
                    {f.label.toLowerCase()}
                  </a>
                </span>
              ))}
              .
            </p>
            <UploadForm files={ODOO_FILES} />
          </CardBody>
        </Card>

        {batch && report ? (
          <>
            <Card aria-labelledby="run-title">
              <CardHeader
                id="run-title"
                title="Latest upload"
                description={`By ${batch.uploadedByName}, ${formatMoment(batch.createdAt, DEFAULT_TIME_ZONE)}.${batch.approvedAt ? ` Approved by ${batch.approvedByName}, ${formatMoment(batch.approvedAt, DEFAULT_TIME_ZONE)}.` : ""}`}
                action={<Badge tone={STATUS[batch.status].tone}>{STATUS[batch.status].label}</Badge>}
              />
              <CardBody className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                  <Stat label="New customers">{report.counts.customers}</Stat>
                  <Stat label="People">{report.counts.people}</Stat>
                  <Stat label="Services">{report.counts.services}</Stat>
                  <Stat label="Domains">{report.counts.domains}</Stat>
                  <Stat label="Unpaid invoices">{report.counts.invoices}</Stat>
                </div>
                <DetailList
                  items={[
                    ["Each month, at kept prices", perCurrency(report.monthly)],
                    ["Opening balances", perCurrency(report.openingBalances)],
                    ["First due date", report.earliestDue ? formatDay(parseDateOnly(report.earliestDue)!, true) : "None"],
                    ...(report.counts.done ? ([["Already brought over", `${report.counts.done}, skipped`]] as [string, string][]) : []),
                    ...(report.counts.skipped ? ([["Closed or paid in Odoo", `${report.counts.skipped}, left out`]] as [string, string][]) : []),
                  ]}
                />
                {batch.status === "IMPORTING" || batch.status === "APPROVED" ? <Alert tone="info">The import is running. Refresh this page to follow it.</Alert> : null}
                {batch.status === "FAILED" ? (
                  <>
                    <Alert>{batch.error ?? "The import stopped."}</Alert>
                    {unfinished.length ? (
                      <ul className="list-disc pl-5 text-callout text-ink-body">
                        {unfinished.map((r) => (
                          <li key={r.id}>
                            {r.kind} {r.sourceRef}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <CarryOnForm batchId={batch.id} unfinished={unfinished.length > 0} />
                  </>
                ) : null}
              </CardBody>
            </Card>

            {report.problems.length ? (
              <Card aria-labelledby="problems-title">
                <CardHeader id="problems-title" title={`Problems to fix first (${report.problems.length})`} description="Correct these in Odoo or in the files, then upload again. Nothing can be approved while there are any." />
                <ul className="divide-y divide-border">
                  {report.problems.map((p, i) => (
                    <li key={i} className="px-5 py-3 text-ink-body sm:px-6">
                      <span className="text-callout text-ink-muted">
                        {FILE_LABEL[p.file]}
                        {p.row ? `, row ${p.row}` : ""}:{" "}
                      </span>
                      {p.message}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {report.warnings.length ? (
              <Card aria-labelledby="warnings-title">
                <CardHeader id="warnings-title" title={`Worth a look (${report.warnings.length})`} />
                <ul className="divide-y divide-border">
                  {report.warnings.map((p, i) => (
                    <li key={i} className="px-5 py-3 text-ink-body sm:px-6">
                      <span className="text-callout text-ink-muted">
                        {FILE_LABEL[p.file]}
                        {p.row ? `, row ${p.row}` : ""}:{" "}
                      </span>
                      {p.message}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {report.products.length ? (
              <Card aria-labelledby="products-title">
                <CardHeader
                  id="products-title"
                  title="Products"
                  description="Each Odoo product becomes the closest catalogue product, or a hidden legacy service when nothing is close. Customers keep their own prices either way."
                />
                <CardBody>
                  {batch.status === "REVIEW" ? (
                    <ProductChoices
                      batchId={batch.id}
                      options={choices}
                      rows={report.products.map((p) => ({ odooProduct: p.odooProduct, lines: p.lines, current: p.legacy ? "legacy" : p.slug, how: p.how === "staff" ? "chosen by staff" : p.how === "name" ? `matched on the name: ${p.name}` : "no close match, so a legacy service" }))}
                    />
                  ) : (
                    <DetailList items={report.products.map((p) => [p.odooProduct, p.legacy ? `Legacy service: ${p.name}` : p.name])} />
                  )}
                </CardBody>
              </Card>
            ) : null}

            <Card aria-labelledby="customers-title">
              <CardHeader id="customers-title" title={`Customers (${report.customers.length})`} description="What each one gets. Open a customer to see the detail." />
              <ul className="divide-y divide-border">
                {report.customers.map((c) => (
                  <li key={c.ref}>
                    <details className="group">
                      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 sm:px-6">
                        <span className="min-w-0 flex-1 font-semibold break-words text-ink">{c.name}</span>
                        <span className="text-callout text-ink-muted">
                          {c.services.length} {c.services.length === 1 ? "service" : "services"}, {c.domains.length} {c.domains.length === 1 ? "domain" : "domains"}, {c.invoices.length} unpaid
                        </span>
                        {c.organisationId ? <Badge>Account exists</Badge> : null}
                      </summary>
                      <div className="flex flex-col gap-5 px-5 pb-5 sm:px-6">
                        <DetailList
                          items={[
                            ["Market", `${c.market.toUpperCase()}, billed in ${c.currency}`],
                            ["Billing email", c.billingEmail ?? "None"],
                            ["People", c.people.length ? c.people.map((p) => `${p.name} (${p.email}), ${ROLE_LABEL[p.role]}${p.existingUser ? ", already has a sign-in" : ""}`).join("; ") : "Already brought over"],
                          ]}
                        />
                        {c.services.length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-160 text-left text-callout">
                              <caption className="sr-only">Services for {c.name}</caption>
                              <thead className="text-ink-muted">
                                <tr>
                                  <th scope="col" className="py-2 pr-4 font-semibold">Service</th>
                                  <th scope="col" className="py-2 pr-4 font-semibold">Kept price</th>
                                  <th scope="col" className="py-2 pr-4 font-semibold">Next due</th>
                                  <th scope="col" className="py-2 font-semibold">Runs at</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {c.services.map((s) => (
                                  <tr key={s.ref} className={s.done ? "text-ink-muted" : "text-ink"}>
                                    <td className="py-2 pr-4">
                                      {s.productName}
                                      {s.quantity > 1 ? ` x ${s.quantity}` : ""}
                                      {s.legacy ? " (legacy)" : ""}
                                      <span className="block text-ink-muted">{s.subscription}{s.done ? ", already brought over" : ""}</span>
                                    </td>
                                    <td className="py-2 pr-4 tabular-nums">
                                      {fmt(s.recurringMinor, c.currency)} {PRICE_PER[s.cycle].replace("Price ", "").toLowerCase()}
                                      {s.reviewOn ? <span className="block text-ink-muted">Review {formatDay(parseDateOnly(s.reviewOn)!, true)}</span> : null}
                                    </td>
                                    <td className="py-2 pr-4 tabular-nums">{formatDay(parseDateOnly(s.nextDueOn)!, true)}</td>
                                    <td className="py-2">
                                      {HOST_LABEL[s.hostedAt]}
                                      {s.hostServer ? <span className="block text-ink-muted">{s.hostServer}</span> : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                        {c.domains.length || c.invoices.length ? (
                          <DetailList
                            items={[
                              ...c.domains.map((d) => [d.name, `Renews ${formatDay(parseDateOnly(d.expiresOn)!, true)} at ${fmt(d.renewalMinor, c.currency)}${d.done ? ", already brought over" : ""}`] as [string, string]),
                              ...c.invoices.map((i) => [i.number, `${fmt(i.amountMinor, c.currency)} owed, due ${formatDay(parseDateOnly(i.dueOn)!, true)}${i.done ? ", already brought over" : ""}`] as [string, string]),
                            ]}
                          />
                        ) : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </Card>

            {batch.status === "REVIEW" && !report.problems.length && (report.counts.customers || report.counts.services || report.counts.domains || report.counts.invoices) ? (
              <Card aria-labelledby="approve-title">
                <CardHeader id="approve-title" title="Approve the import" />
                <CardBody>
                  <ApproveForm
                    batchId={batch.id}
                    hash={batch.reportHash}
                    summary={`This opens ${report.counts.customers} customer accounts and brings over ${report.counts.services} services, ${report.counts.domains} domains and ${report.counts.invoices} unpaid invoices, exactly as listed above. Nobody is emailed. Once it has run, stop invoicing these customers in Odoo.`}
                  />
                </CardBody>
              </Card>
            ) : null}

            {batch.status === "IMPORTED" ? (
              <Card aria-labelledby="cutover-title">
                <CardHeader
                  id="cutover-title"
                  title="Cutover and welcome emails"
                  description={`${people} ${people === 1 ? "person gets" : "people get"} an email inviting them to the console, with a link to choose a password. Choose the day you switch from Odoo, before the first due date.`}
                />
                <CardBody>
                  {batch.welcomeSentAt ? (
                    <p className="text-ink-body">Welcome emails went out {formatMoment(batch.welcomeSentAt, DEFAULT_TIME_ZONE)}.</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <p className="text-ink-body">{batch.cutoverOn ? `Welcome emails go out on ${formatDay(batch.cutoverOn, true)} from 08:00, set by ${batch.cutoverSetByName}.` : "No cutover date yet, so nobody has been emailed."}</p>
                      <CutoverForm batchId={batch.id} current={batch.cutoverOn ? toDateOnly(batch.cutoverOn) : ""} min={toDateOnly(today)} />
                    </div>
                  )}
                </CardBody>
              </Card>
            ) : null}
          </>
        ) : null}

        {reviews.length ? (
          <Card aria-labelledby="reviews-title">
            <CardHeader id="reviews-title" title="Kept prices due for review" description="Nothing changes by itself. Decide with the customer, then set a new date or clear it on their page." />
            <ul className="divide-y divide-border">
              {reviews.map((r) => (
                <li key={r.billingServiceId} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                  <Link href={`/admin/customers/${r.organisation.id}`} className="min-w-0 flex-1 text-link underline underline-offset-2">
                    {r.organisation.name}
                  </Link>
                  <span className="text-callout text-ink-muted tabular-nums">
                    {r.source ?? "Service"}, {fmt(String(r.legacyRecurringMinor), r.legacyCurrency!)}, review {formatDay(r.legacyReviewOn!, true)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
