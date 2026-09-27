import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { CATCH_ALL, marketChanges } from "@/server/markets/markets";
import { MarketSettingsForm, MarketSwitches } from "../forms";

export const metadata: Metadata = { title: "Market" };

const FIELD_LABEL: Record<string, string> = {
  enabled: "Switched on",
  isDefault: "Default market",
  taxEnabled: "Charge tax",
  taxRateBps: "Tax rate (basis points)",
  taxDisplay: "Show prices",
  taxLabel: "Tax name",
  taxRegistrationNumber: "Tax number",
  companyRegistrationNumber: "Company registration number",
  registeredAddress: "Registered office",
  ownDataCentre: "Own data centre live",
  paymentMethods: "Ways to pay",
  eftBankName: "Bank",
  eftAccountName: "Account name",
  eftAccountNumber: "Account number",
  eftBranchCode: "Branch code",
  eftSwiftCode: "SWIFT code",
  supportEmail: "Support email",
  supportPhone: "Support phone",
  supportHours: "Support hours",
  highlightedTlds: "Domain endings",
  dataProtectionLaw: "Data protection law",
  timeZone: "Time zone",
};

const label = (field: string) => FIELD_LABEL[field] ?? field[0].toUpperCase() + field.slice(1);

export default async function MarketPage({ params }: { params: Promise<{ code: string }> }) {
  await requireStaffCan("manageMarkets");
  const { code } = await params;
  const m = await prisma.market.findUnique({ where: { code } });
  if (!m) notFound();
  const changes = await marketChanges(prisma, code);

  return (
    <>
      <Link href="/admin/markets" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Markets
      </Link>
      <PageHeader
        eyebrow={`/${m.code}`}
        title={m.name}
        actions={
          <span className="flex gap-2">
            {m.isDefault ? <Badge tone="info">Default</Badge> : null}
            {m.enabled ? <Badge tone="positive">On</Badge> : <Badge>Off</Badge>}
          </span>
        }
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="status-title">
          <CardHeader
            id="status-title"
            title="Availability"
            description={
              m.isDefault
                ? "The default market stays on. Visitors whose country we can't tell, or whose market is off, see it."
                : m.enabled
                  ? "On: its countries can sign up and its public pages are live."
                  : "Off: sign-ups from its countries go to the waiting list and its public pages send visitors to the default market."
            }
          />
          <CardBody>
            <MarketSwitches code={m.code} enabled={m.enabled} isDefault={m.isDefault} />
          </CardBody>
        </Card>
        <Card aria-labelledby="settings-title">
          <CardHeader id="settings-title" title="Settings" description="Every change is logged below with who made it." />
          <CardBody>
            <MarketSettingsForm
              catchAll={m.code === CATCH_ALL}
              market={{
                code: m.code,
                name: m.name,
                countries: m.countries.join(", "),
                currency: m.currency,
                locale: m.locale,
                timeZone: m.timeZone,
                taxEnabled: m.taxEnabled,
                taxRatePercent: String(m.taxRateBps / 100),
                taxDisplay: m.taxDisplay,
                taxLabel: m.taxLabel,
                taxRegistrationNumber: m.taxRegistrationNumber ?? "",
                companyRegistrationNumber: m.companyRegistrationNumber ?? "",
                registeredAddress: m.registeredAddress ?? "",
                ownDataCentre: m.ownDataCentre,
                paymentMethods: m.paymentMethods,
                eftBankName: m.eftBankName ?? "",
                eftAccountName: m.eftAccountName ?? "",
                eftAccountNumber: m.eftAccountNumber ?? "",
                eftBranchCode: m.eftBranchCode ?? "",
                eftSwiftCode: m.eftSwiftCode ?? "",
                supportEmail: m.supportEmail,
                supportPhone: m.supportPhone ?? "",
                supportHours: m.supportHours,
                highlightedTlds: m.highlightedTlds.join(", "),
                dataProtectionLaw: m.dataProtectionLaw ?? "",
              }}
            />
          </CardBody>
        </Card>
        <Card aria-labelledby="changes-title">
          <CardHeader id="changes-title" title="Changes" />
          {changes.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No changes yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {changes.map((c) => (
                <li key={c.id} className="flex flex-col px-5 py-3 sm:px-6">
                  <span className="text-ink">
                    {label(c.field)}: {c.fromValue ?? "none"} to {c.toValue ?? "none"}
                  </span>
                  <span className="text-callout text-ink-muted">
                    {c.user.name}, {formatMoment(c.createdAt, m.timeZone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
