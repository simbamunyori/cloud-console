import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainStatusBadge } from "@/components/app/status";
import { Alert } from "@/components/ui/alert";
import { Amount } from "@/components/ui/amount";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { countryOptions } from "@/lib/countries";
import { formatDay } from "@/lib/dates";
import { toJson } from "@/lib/domain/money";
import { requireBilling } from "@/server/billing/context";
import { prisma } from "@/server/db";
import { domainPanel } from "@/server/domains/manage";
import { featureSwitches } from "@/server/features/features";
import { can, DomainError } from "@/server/org/access";
import { ContactForm, DnsForm, NameserversForm, RenewForm, TransferCodeForm } from "./forms";

export const metadata: Metadata = { title: "Domain" };

const PENDING: Record<string, string> = {
  REGISTER: "Registration",
  RENEW: "Renewal",
  TRANSFER: "Transfer",
};

export default async function DomainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { billing, db, actor, locale } = await requireBilling();
  const features = await featureSwitches(prisma);
  // Hidden until an Admin turns on a domain registrar in Features.
  if (!features["openprovider-domains"] && !features["bw-registry-domains"]) notFound();
  const panel = await domainPanel({ db, billing, actor }, id).catch((e) => {
    if (e instanceof DomainError && e.code === "not-found") return null;
    throw e;
  });
  if (!panel) notFound();
  const { domain } = panel;
  const canOrder = can(actor, "order");

  return (
    <>
      <Link href="/app/services#domains" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Services
      </Link>
      <PageHeader eyebrow="Domain" title={domain.name} actions={<DomainStatusBadge status={domain.status} />} />
      <div className="flex flex-col gap-6">
        {panel.pending.map((p) => (
          <Alert key={p.id} tone="info">
            {PENDING[p.kind]} {p.status === "WAITING_PAYMENT" ? "goes through once its invoice is paid." : "is with the registry. We'll email you when it's done."}
          </Alert>
        ))}
        {!panel.reachable ? <Alert>The domain registry isn&apos;t answering right now, so changes are paused. Try again in a few minutes.</Alert> : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card aria-labelledby="summary-title">
            <CardHeader id="summary-title" title="Registration" />
            <CardBody>
              <DetailList
                items={[
                  ["Registered", formatDay(domain.registeredOn, true)],
                  ["Expires", formatDay(domain.expiresOn, true)],
                  ["Renews on its own", domain.autoRenew ? "Yes, the renewal goes on an invoice before it expires" : "No"],
                  ["Renewal", <span key="r"><Amount locale={locale} value={domain.renewal} /> a year</span>],
                ]}
              />
            </CardBody>
          </Card>
          <Card aria-labelledby="renew-title">
            <CardHeader id="renew-title" title="Renew now" description="Add years now. The new expiry date counts from the current one, so nothing is lost." />
            <CardBody>
              {panel.renewable && canOrder ? (
                <RenewForm domainId={domain.domainId} name={domain.name} price={toJson(domain.renewal)} locale={locale} />
              ) : (
                <p className="text-ink-muted">
                  {canOrder ? "Renewals for this domain are arranged by our team. " : "Only owners and admins can renew domains. "}
                  <Link href="/app/support/new" className="text-link hover:underline">
                    Ask us
                  </Link>
                  .
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        {panel.managed ? (
          <>
            <Card aria-labelledby="ns-title">
              <CardHeader id="ns-title" title="Nameservers" description="The servers that say where this domain's website and email are." />
              <CardBody>
                <NameserversForm domainId={domain.domainId} nameservers={panel.nameservers} />
              </CardBody>
            </Card>
            {panel.dns.supported ? (
              <Card aria-labelledby="dns-title">
                <CardHeader
                  id="dns-title"
                  title="DNS records"
                  description={
                    panel.dns.records
                      ? "The records for your website, email and services. A wrong record can stop email arriving, so change one thing at a time."
                      : "We don't hold DNS records for this domain yet. Saving creates them; they take effect when the nameservers point to ours."
                  }
                />
                <CardBody>
                  <DnsForm
                    key={JSON.stringify(panel.dns.records ?? [])}
                    domainId={domain.domainId}
                    domain={domain.name}
                    records={(panel.dns.records ?? []).map((r) => ({ type: r.type, name: r.name, value: r.value, ttl: String(r.ttl), priority: r.priority === undefined ? "" : String(r.priority) }))}
                  />
                </CardBody>
              </Card>
            ) : null}
            <Card aria-labelledby="contact-title">
              <CardHeader id="contact-title" title="Owner details" description="The registry's record of who owns the domain. Keep the email current: renewal and transfer notices go there." />
              <CardBody>
                <ContactForm
                  domainId={domain.domainId}
                  countries={countryOptions()}
                  contact={{
                    firstName: panel.contact?.firstName ?? "",
                    lastName: panel.contact?.lastName ?? "",
                    companyName: panel.contact?.companyName ?? "",
                    email: panel.contact?.email ?? "",
                    phone: panel.contact?.phone ?? "",
                    address: panel.contact?.address ?? "",
                    city: panel.contact?.city ?? "",
                    postcode: panel.contact?.postcode ?? "",
                    country: panel.contact?.country ?? "",
                  }}
                />
              </CardBody>
            </Card>
            <Card aria-labelledby="out-title">
              <CardHeader id="out-title" title="Move this domain away" description="Another provider needs this code to take the domain over. We'd be sorry to see it go." />
              <CardBody>
                <TransferCodeForm domainId={domain.domainId} />
              </CardBody>
            </Card>
          </>
        ) : panel.reachable && domain.status === "active" && canOrder ? (
          <Card>
            <CardBody>
              <p className="text-ink-muted">
                Nameserver, DNS and owner changes for this domain are made by our team.{" "}
                <Link href="/app/support/new" className="text-link hover:underline">
                  Open a ticket
                </Link>{" "}
                and we&apos;ll do it.
              </p>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
