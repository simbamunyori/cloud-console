import { ArrowLeft, FileDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceStatusBadge, OrderStatusBadge, ServiceStatusBadge } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay, formatMoment, todayIn } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import { requireStaffCan } from "@/server/admin/context";
import { customerDetail } from "@/server/admin/customers";
import { billingAdapter } from "@/server/billing";
import { scopedBilling } from "@/server/billing/scoped";
import { amountOwed, isOverdue, monthlyTotal, PRICE_PER } from "@/server/billing/views";
import { HOST_LABEL } from "@/server/migration/services";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { tenantOverview } from "@/server/licences/licences";
import { ROLE_LABEL } from "@/server/org/access";
import { countryName } from "@/lib/countries";
import { listMarkets } from "@/server/markets/markets";
import { staffCan } from "@/server/staff/access";
import { InternalOrganisationSwitch } from "../../catalogue/forms";
import { ChangeMarketForm } from "../../markets/forms";
import { HostingForm, MoveForm, ReviewForm } from "./service-forms";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await requireStaffCan("viewCustomers");
  const { id } = await params;
  const detail = await customerDetail(prisma, id);
  if (!detail) notFound();
  const { organisation: org, orders, audit, eft } = detail;
  const tz = org.timeZone;
  const today = todayIn(tz);
  const account = await prisma.billingAccount.findUnique({ where: { organisationId: org.id } });
  const billing = account ? await scopedBilling(prisma, billingAdapter(), org.id) : null;
  const [services, invoices] = billing ? await Promise.all([billing.listServices(), billing.listInvoices()]) : [[], []];
  const markets = staffCan(staff, "manageMarkets") ? await listMarkets(prisma) : null;
  const pdfs = await featureOn(prisma, "branded-pdfs");
  const market = await prisma.market.findUniqueOrThrow({ where: { code: org.billingMarket } });
  const tenants = await tenantOverview(prisma, org.id);
  const profiles = await prisma.serviceProfile.findMany({ where: { organisationId: org.id } });
  const [cloudSubs, openTips] = await Promise.all([prisma.cloudSubscription.findMany({ where: { organisationId: org.id }, select: { name: true }, orderBy: { name: "asc" } }), prisma.savingTip.count({ where: { organisationId: org.id, status: "OPEN" } })]);

  return (
    <>
      <Link href="/admin/customers" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Customers
      </Link>
      <PageHeader
        title={org.name}
        eyebrow={account ? `Billing client ${account.externalClientId}` : "No billing account yet"}
        actions={org.deletedAt ? <Badge>Closed</Badge> : org.internal ? <Badge tone="warning">Test organisation</Badge> : null}
      />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-1 p-5">
            <span className="text-callout text-ink-muted">Each month</span>
            <span className="text-title-2 text-ink tabular-nums">{formatMoney(monthlyTotal(services, org.currency), org.locale)}</span>
          </Card>
          <Card className="flex flex-col gap-1 p-5">
            <span className="text-callout text-ink-muted">Owed now</span>
            <span className="text-title-2 text-ink tabular-nums">{formatMoney(amountOwed(invoices, org.currency), org.locale)}</span>
          </Card>
          <Card className="flex flex-col gap-1 p-5">
            <span className="text-callout text-ink-muted">EFT waiting for us</span>
            <span className="text-title-2 text-ink tabular-nums">{eft.length}</span>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <Card aria-labelledby="org-title">
            <CardHeader id="org-title" title="Organisation" />
            <CardBody>
              <DetailList
                items={[
                  ["Billing email", org.billingEmail ?? "Not set"],
                  ["Billing country", countryName(org.country)],
                  ["Market", market.name],
                  ["Currency", org.currency],
                  ["VAT number", org.vatNumber ?? "None"],
                  ["Address", [org.addressLine1, org.city].filter(Boolean).join(", ") || "Not set"],
                  ["Opened", formatDay(org.createdAt, true)],
                  ["Kind", org.internal ? "Our own test organisation: sees internal products" : "Customer"],
                ]}
              />
              {staffCan(staff, "manageCatalogue") && !org.deletedAt ? (
                <div className="mt-6 border-t border-border pt-6">
                  <InternalOrganisationSwitch organisationId={org.id} internal={org.internal} />
                </div>
              ) : null}
              {markets ? (
                <div className="mt-6 border-t border-border pt-6">
                  <ChangeMarketForm organisationId={org.id} current={org.billingMarket} markets={markets.map((m) => ({ value: m.code, label: `${m.name} (${m.currency})${m.enabled ? "" : ", off"}` }))} />
                </div>
              ) : null}
            </CardBody>
          </Card>
          <Card aria-labelledby="people-title">
            <CardHeader id="people-title" title={`People (${org.memberships.length})`} />
            <ul className="divide-y divide-border">
              {org.memberships.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-ink">{m.user.name}</span>
                    <span className="truncate text-callout text-ink-muted">{m.user.email}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Badge>{ROLE_LABEL[m.role]}</Badge>
                    {!m.user.totpEnabled && !m.user._count.passkeys ? <Badge tone="warning">No two-step yet</Badge> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card aria-labelledby="tenants-title">
          <CardHeader
            id="tenants-title"
            title="Microsoft 365 and Google Workspace"
            action={
              <Link href={`/admin/customers/${org.id}/licences`} className="text-callout text-link hover:underline">
                {tenants.length ? "Users and licences" : "Link a tenant"}
              </Link>
            }
          />
          {tenants.length ? (
            <ul className="divide-y divide-border">
              {tenants.map((t) => {
                const unused = t.licences.reduce((n, l) => n + l.unused, 0);
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-ink">{t.vendorLabel}</span>
                      <span className="text-callout text-ink-muted">
                        {t.primaryDomain}, {t.users.filter((u) => u.enabled).length} people
                      </span>
                    </span>
                    {unused ? <Badge tone="warning">{unused} unused</Badge> : <Badge tone="positive">All licences in use</Badge>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <CardBody>
              <p className="text-ink-muted">No tenant linked.</p>
            </CardBody>
          )}
        </Card>

        <Card aria-labelledby="spend-title">
          <CardHeader
            id="spend-title"
            title="Azure and savings"
            action={
              <Link href={`/admin/customers/${org.id}/spend`} className="text-callout text-link hover:underline">
                {cloudSubs.length ? "Cloud spend" : "Link a subscription"}
              </Link>
            }
          />
          <CardBody>
            <p className="text-ink-muted">
              {cloudSubs.length ? `${cloudSubs.length} Azure ${cloudSubs.length === 1 ? "subscription" : "subscriptions"}: ${cloudSubs.map((s) => s.name).join(", ")}.` : "No Azure subscription linked."}{" "}
              {openTips ? `${openTips} ${openTips === 1 ? "way" : "ways"} to save showing.` : ""}
            </p>
          </CardBody>
        </Card>

        <Card aria-labelledby="services-title">
          <CardHeader id="services-title" title="Services" description="As billing holds them. Kept prices and services that run with another provider came over from Odoo." />
          {services.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No services yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {services.map((s) => {
                const profile = profiles.find((p) => p.billingServiceId === s.serviceId);
                const elsewhere = profile && profile.hostedAt !== "OURS";
                const kept = profile?.legacyRecurringMinor != null;
                const canHost = staffCan(staff, "manageHosting") && s.status !== "cancelled" && s.status !== "terminated";
                const canReview = kept && staffCan(staff, "managePricing");
                return (
                  <li key={s.serviceId} className="flex flex-col gap-2 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="break-words text-ink">
                          {s.name}
                          {s.quantity > 1 ? ` x ${s.quantity}` : ""}
                          {s.domain ? <span className="text-ink-muted">, {s.domain}</span> : null}
                        </span>
                        <span className="text-callout text-ink-muted tabular-nums">
                          {formatMoney(s.recurring, org.locale)} {PRICE_PER[s.billingCycle].replace("Price ", "").toLowerCase()}, next due {formatDay(s.nextDueOn, true)}
                        </span>
                      </span>
                      {kept ? <Badge tone="info">{profile?.legacyReviewOn ? `Kept price, review ${formatDay(profile.legacyReviewOn, true)}` : "Kept price"}</Badge> : null}
                      {elsewhere ? <Badge tone="warning">At {HOST_LABEL[profile.hostedAt]}</Badge> : null}
                      <ServiceStatusBadge status={s.status} />
                    </div>
                    {elsewhere ? (
                      <p className="text-callout text-ink-muted">
                        {profile.hostServer ?? "Server or account not recorded"}
                        {profile.hostNotes ? `. ${profile.hostNotes}` : ""}
                      </p>
                    ) : null}
                    {canHost || canReview ? (
                      <details>
                        <summary className="cursor-pointer text-callout text-link">{elsewhere ? "Hosting and price" : kept ? "Price review and hosting" : "It runs with another provider"}</summary>
                        <div className="mt-4 flex flex-col gap-6">
                          {canReview ? <ReviewForm organisationId={org.id} serviceId={s.serviceId} current={profile?.legacyReviewOn ? profile.legacyReviewOn.toISOString().slice(0, 10) : ""} /> : null}
                          {canHost ? <HostingForm organisationId={org.id} serviceId={s.serviceId} current={{ hostedAt: profile?.hostedAt ?? "OURS", hostServer: profile?.hostServer ?? "", hostNotes: profile?.hostNotes ?? "" }} /> : null}
                          {canHost && elsewhere ? <MoveForm organisationId={org.id} serviceId={s.serviceId} /> : null}
                        </div>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="orders-title">
          <CardHeader id="orders-title" title="Orders" />
          {orders.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No orders yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-ink">
                      {o.product.name}
                      {o.quantity > 1 ? ` x ${o.quantity}` : ""}
                    </span>
                    <span className="truncate text-callout text-ink-muted tabular-nums">
                      {o.reference}, {formatDay(o.createdAt, true)}, {formatMoney(money(o.monthlyTotalMinor, o.currency), org.locale)} a month
                    </span>
                  </span>
                  <OrderStatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="invoices-title">
          <CardHeader id="invoices-title" title="Recent invoices" />
          {invoices.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No invoices yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {invoices.slice(0, 6).map((i) => (
                <li key={i.invoiceId} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-ink tabular-nums">{i.number}</span>
                    <span className="text-callout text-ink-muted">{formatDay(i.issuedOn, true)}</span>
                  </span>
                  <span className="text-callout text-ink tabular-nums">{formatMoney(i.total, org.locale)}</span>
                  <InvoiceStatusBadge status={i.status} overdue={isOverdue(i, today)} />
                  {pdfs && (
                    <a
                      href={`/admin/customers/${org.id}/invoices/${encodeURIComponent(i.invoiceId)}/pdf`}
                      download
                      className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
                      aria-label={`Download invoice ${i.number} as PDF`}
                    >
                      <FileDown aria-hidden className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="audit-title">
          <CardHeader id="audit-title" title="Activity" description="The customer sees the same list, including everything our staff did." />
          <ul className="divide-y divide-border">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 px-5 py-3 sm:px-6">
                <span className="text-ink">{a.summary}</span>
                <span className="text-callout text-ink-muted">
                  {a.actorLabel}
                  {a.actorKind === "STAFF" ? " (staff)" : a.actorKind === "CUSTOMER" ? "" : ` (${a.actorKind.toLowerCase()})`}, {formatMoment(a.createdAt, tz)}
                  {!a.visibleToCustomer ? " (internal)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
