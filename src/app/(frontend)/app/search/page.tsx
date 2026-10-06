import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConsoleSearch } from "@/components/app/top-bar";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { priceDay } from "@/lib/domain/pricing";
import { requireBilling } from "@/server/billing/context";
import { marketplace } from "@/server/catalogue/price-book";
import { audienceFor } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Search" };

const PAGES = [
  { label: "Home", href: "/app", words: "home overview dashboard total" },
  { label: "Marketplace", href: "/app/marketplace", words: "marketplace order buy add products prices" },
  { label: "Find a domain", href: "/app/marketplace/domains", words: "domain name register transfer" },
  { label: "Services", href: "/app/services", words: "services subscriptions licences users domains" },
  { label: "Billing", href: "/app/billing", words: "billing invoices pay payments card bank transfer eft" },
  { label: "Cloud spend", href: "/app/spend", words: "cloud spend costs forecast savings azure usage budget waste" },
  { label: "Statements", href: "/app/billing/statements", words: "statement balance" },
  { label: "Support", href: "/app/support", words: "support help tickets" },
  { label: "Ask the assistant", href: "/app/support/assistant", words: "assistant ai question help" },
  { label: "Team", href: "/app/team", words: "team people users invite roles" },
  { label: "Users and licences", href: "/app/licences", words: "licences licenses users seats microsoft 365 google workspace mailbox unused" },
  { label: "Security", href: "/app/security", words: "security password authenticator backup codes sign-ins activity" },
  { label: "Settings", href: "/app/settings", words: "settings company address vat billing email" },
];

type Hit = { key: string; label: string; detail: string; href: string };

/** One search across the customer's own account and the marketplace. Every lookup is scoped to the organisation. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const needle = q.toLowerCase();
  const has = (...texts: (string | null | undefined)[]) => texts.some((t) => t?.toLowerCase().includes(needle));
  const groups: { title: string; hits: Hit[] }[] = [];

  if (needle) {
    const { billing, db, market, today, organisation } = await requireBilling();
    const [services, domains, invoices, tickets, catalogue] = await Promise.all([
      billing.listServices(),
      billing.listDomains(),
      billing.listInvoices(),
      db.ticket.findMany({ where: { deletedAt: null, subject: { contains: q, mode: "insensitive" } }, orderBy: { updatedAt: "desc" }, take: 8 }),
      marketplace(prisma, market, priceDay(today), audienceFor(organisation)),
    ]);
    groups.push(
      { title: "Services", hits: services.filter((s) => has(s.name, s.groupName, s.domain)).map((s) => ({ key: s.serviceId, label: s.name, detail: [s.groupName, s.domain].filter(Boolean).join(", "), href: `/app/services/${s.serviceId}` })) },
      { title: "Domains", hits: domains.filter((d) => has(d.name)).map((d) => ({ key: d.domainId, label: d.name, detail: `Expires ${formatDay(d.expiresOn, true)}`, href: "/app/services" })) },
      { title: "Invoices", hits: invoices.filter((i) => has(i.number)).map((i) => ({ key: i.invoiceId, label: i.number, detail: `Issued ${formatDay(i.issuedOn, true)}`, href: `/app/billing/invoices/${i.invoiceId}` })) },
      { title: "Tickets", hits: tickets.map((t) => ({ key: t.id, label: t.subject, detail: t.reference, href: `/app/support/tickets/${t.reference}` })) },
      {
        title: "Marketplace",
        hits: catalogue.flatMap(({ products }) => products.filter(({ product }) => has(product.name, product.summary)).map(({ product }) => ({ key: product.id, label: product.name, detail: product.summary, href: `/app/marketplace/${product.slug}` }))),
      },
      { title: "Pages", hits: PAGES.filter((p) => has(p.label, p.words)).map((p) => ({ key: p.href, label: p.label, detail: "", href: p.href })) },
    );
  }
  const found = groups.filter((g) => g.hits.length);

  return (
    <>
      <PageHeader title="Search" description={q ? `Results for “${q}”.` : "Search your services, invoices, domains, tickets and the marketplace."} />
      <div className="flex flex-col gap-6">
        <div className="lg:hidden">
          <ConsoleSearch id="search-page-q" defaultValue={q} />
        </div>
        {q && !found.length ? (
          <EmptyState icon={SearchX} title="Nothing found">
            Try a service name, an invoice number such as INV-2026-0142, or a domain.
          </EmptyState>
        ) : null}
        {found.map((g) => (
          <Card key={g.title} aria-labelledby={`search-${g.title}`}>
            <CardHeader id={`search-${g.title}`} title={`${g.title} (${g.hits.length})`} />
            <ul className="divide-y divide-border">
              {g.hits.slice(0, 8).map((h) => (
                <li key={h.key}>
                  <Link href={h.href} className="flex flex-col gap-0.5 px-5 py-3 hover:bg-surface-2 sm:px-6">
                    <span className="font-semibold text-ink">{h.label}</span>
                    {h.detail ? <span className="text-callout text-ink-muted">{h.detail}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
