import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceStatusBadge, UsageBar } from "@/components/app/status";
import { Alert } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { requireBilling } from "@/server/billing/context";
import { monthlyPrice } from "@/server/billing/views";
import { can } from "@/server/org/access";
import { quantityLimits } from "@/server/orders/orders";
import { QuantityForm } from "./quantity-form";

export const metadata: Metadata = { title: "Service" };

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { billing, db, actor, locale } = await requireBilling();
  const service = await billing.getService(id);
  if (!service) notFound();
  const limits = service.status === "active" && can(actor, "order") ? await quantityLimits(db, service.productId) : null;
  const { users, resources, usage } = service.details;
  const perMonth = monthlyPrice(service);

  return (
    <>
      <Link href="/app/services" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Services
      </Link>
      <PageHeader eyebrow={service.groupName} title={service.name} actions={<ServiceStatusBadge status={service.status} />} />
      <div className="flex flex-col gap-6">
        {service.status === "pending" ? (
          <Alert tone="info">We&apos;re setting this up. We&apos;ll email you and it will show as active here when it&apos;s ready.</Alert>
        ) : null}
        {service.status === "suspended" ? (
          <Alert>
            This service is paused{service.suspendReason ? `: ${service.suspendReason}` : ""}. {service.suspendReason === "Overdue on payment" ? "Paying the overdue invoice brings it back straight away." : "Contact support to bring it back."}
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card aria-labelledby="plan-title">
            <CardHeader id="plan-title" title="Plan and price" />
            <CardBody>
              <DetailList
                items={[
                  ["Plan", service.name],
                  ...(service.quantity > 1 ? ([["Users", String(service.quantity)]] as [string, string][]) : []),
                  ...(service.domain ? ([["Domain", service.domain]] as [string, string][]) : []),
                  [service.billingCycle === "annually" ? "Price a year" : "Price a month", <Amount locale={locale} key="p" value={service.recurring} />],
                  ...(service.billingCycle === "annually" ? ([["Works out at", <span key="m"><Amount locale={locale} value={perMonth} /> a month</span>]] as [string, React.ReactNode][]) : []),
                  ...(service.quantity > 1
                    ? ([["Per user", <span key="u"><Amount locale={locale} value={{ amountMinor: service.recurring.amountMinor / BigInt(service.quantity), currency: service.recurring.currency }} /></span>]] as [string, React.ReactNode][])
                    : []),
                  [service.status === "active" ? "Renews" : "Next due", formatDay(service.nextDueOn, true)],
                  ["Started", formatDay(service.registeredOn, true)],
                ]}
              />
            </CardBody>
          </Card>

          {resources?.length ? (
            <Card aria-labelledby="resources-title">
              <CardHeader id="resources-title" title="Details" />
              <CardBody>
                <DetailList items={resources.map((r) => [r.label, r.value])} />
              </CardBody>
            </Card>
          ) : null}
        </div>

        {limits ? (
          <Card aria-labelledby="quantity-title">
            <CardHeader id="quantity-title" title={`Change the number of ${limits.unitLabel.replace(/^per /, "")}s`} description="Adding is charged for the rest of this period. Removing lowers your next invoice." />
            <CardBody>
              <QuantityForm serviceId={service.serviceId} current={service.quantity} min={limits.min} max={limits.max} unitLabel={limits.unitLabel} locale={locale} />
            </CardBody>
          </Card>
        ) : null}

        {usage?.length ? (
          <Card aria-labelledby="usage-title">
            <CardHeader id="usage-title" title="Usage" description="Updated by the service itself, usually every few hours." />
            <CardBody className="flex flex-col gap-5">
              {usage.map((u) => (
                <UsageBar key={u.label} {...u} />
              ))}
            </CardBody>
          </Card>
        ) : null}

        {users?.length ? (
          <Card aria-labelledby="users-title">
            <CardHeader id="users-title" title={`Users (${users.length})`} description="The people this service is licensed for." />
            <ul className="divide-y divide-border">
              {users.map((u) => (
                <li key={u.email} className="flex flex-col px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <span className="text-ink">{u.name}</span>
                  <span className="text-callout text-ink-muted">{u.email}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <p className="text-callout text-ink-muted">
          Something not right with this service?{" "}
          <Link href={`/app/support?service=${service.serviceId}`} className="text-link underline underline-offset-2">
            Ask for help
          </Link>
          .
        </p>
      </div>
    </>
  );
}
