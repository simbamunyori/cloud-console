import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay, formatMoment } from "@/lib/dates";
import { currencySymbol, formatMoney, money } from "@/lib/domain/money";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { staffCan } from "@/server/staff/access";
import { DEFAULT_MARGIN_BPS } from "@/server/spend/usage";
import { AddSavingForm, LinkSubscriptionForm } from "./forms";

export const metadata: Metadata = { title: "Cloud spend" };

const STATUS: Record<string, [string, BadgeTone]> = {
  OPEN: ["Showing", "info"],
  ASKED: ["Customer asked", "warning"],
  DONE: ["Done", "positive"],
  DISMISSED: ["Hidden by customer", "neutral"],
};

/** A customer's Azure subscriptions and ways to save, as staff keep them. */
export default async function CustomerSpendPage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await requireStaffCan("viewCustomers");
  const { id } = await params;
  const org = await prisma.organisation.findUnique({ where: { id }, select: { id: true, name: true, currency: true, locale: true, timeZone: true } });
  if (!org) notFound();
  const [subs, tips] = await Promise.all([
    prisma.cloudSubscription.findMany({ where: { organisationId: org.id }, orderBy: { name: "asc" } }),
    prisma.savingTip.findMany({ where: { organisationId: org.id }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
  ]);
  const latest = await Promise.all(subs.map((s) => prisma.cloudUsage.findFirst({ where: { subscriptionId: s.id }, orderBy: { day: "desc" }, select: { day: true } })));
  const edit = staffCan(staff, "manageCloudSpend");

  return (
    <>
      <Link href={`/admin/customers/${org.id}`} className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {org.name}
      </Link>
      <PageHeader title="Cloud spend" eyebrow={org.name} description="Their Azure subscriptions, which usage files are matched to, and the ways to save they see." />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="subs-title">
          <CardHeader
            id="subs-title"
            title="Azure subscriptions"
            action={
              <Link href="/admin/cloud-usage" className="text-callout text-link hover:underline">
                Upload usage
              </Link>
            }
          />
          {subs.length ? (
            <ul className="divide-y divide-border">
              {subs.map((s, i) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-ink">{s.name}</span>
                    <code className="text-caption break-all text-ink-muted">{s.subscriptionId}</code>
                  </span>
                  <span className="text-callout text-ink-muted">{(s.marginBps / 100).toLocaleString("en")}% margin</span>
                  <Badge tone={latest[i] ? "positive" : "neutral"}>{latest[i] ? `Usage to ${formatDay(latest[i]!.day, true)}` : "No usage yet"}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-ink-muted">None linked.</p>
            </CardBody>
          )}
          {edit ? (
            <CardBody className="border-t border-border">
              <LinkSubscriptionForm organisationId={org.id} defaultMargin={String(DEFAULT_MARGIN_BPS / 100)} />
            </CardBody>
          ) : null}
        </Card>

        <Card aria-labelledby="tips-title">
          <CardHeader id="tips-title" title="Ways to save" description="Found ones come from usage files. Add what you find in Azure Advisor. Unused licences are worked out on their own." />
          {tips.length ? (
            <ul className="divide-y divide-border">
              {tips.map((t) => (
                <li key={t.id} className="flex flex-col gap-1 px-5 py-3 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-semibold text-ink">{t.title}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-callout text-ink tabular-nums">{formatMoney(money(t.monthlyMinor, t.currency), org.locale)} a month</span>
                      <Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge>
                    </span>
                  </div>
                  <span className="text-callout text-ink-muted">
                    {t.source === "AUTO" ? "Found in usage" : "Added by staff"}, {formatMoment(t.createdAt, org.timeZone)}
                    {t.taskId && t.status === "ASKED" ? (
                      <>
                        {", "}
                        <Link href="/admin/tasks" className="text-link underline underline-offset-2">
                          in the task queue
                        </Link>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-ink-muted">None yet.</p>
            </CardBody>
          )}
          {edit ? (
            <CardBody className="border-t border-border">
              <AddSavingForm organisationId={org.id} currencySymbol={currencySymbol(org.currency, org.locale)} />
            </CardBody>
          ) : null}
        </Card>
      </div>
    </>
  );
}
