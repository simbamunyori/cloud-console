import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { companyPusher } from "@/server/billing";
import { bankAccounts, companyDetails } from "@/server/company/company";
import { prisma } from "@/server/db";
import { BankAccountForm, CompanyForm, LogoForm, PushCompanyForm } from "./forms";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage() {
  await requireStaffCan("manageCompany");
  const [company, { rows, markets }] = await Promise.all([companyDetails(prisma), bankAccounts(prisma)]);
  const marketName = new Map(markets.map((m) => [m.code, m.name]));
  const version = company.updatedAt?.getTime() ?? 0;
  const defaultMarket = markets.find((m) => m.isDefault) ?? markets[0];
  const whmcs = Boolean(companyPusher());

  return (
    <>
      <PageHeader
        title="Company"
        description="Our legal name, registration, address, contacts, logos and bank details. Invoices, quotes, emails, the website footer and WHMCS all use what is saved here."
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="details-title">
          <CardHeader id="details-title" title="Details" description={company.updatedAt ? undefined : "Showing the details the platform already had. Save to keep them here."} />
          <CardBody>
            <CompanyForm
              company={{
                legalName: company.legalName,
                tradingName: company.tradingName,
                registrationNumber: company.registrationNumber,
                address: company.addressLines.join("\n"),
                phone: company.phone ?? "",
                email: company.email,
                website: company.website ?? "",
                invoiceFooter: company.invoiceFooter ?? "",
                paymentTerms: company.paymentTerms ?? "",
                quoteTerms: company.quoteTerms ?? "",
              }}
            />
          </CardBody>
        </Card>

        <Card aria-labelledby="logos-title">
          <CardHeader id="logos-title" title="Logos" description="The full logo, used at the top of invoices, quotes and emails. Until one is uploaded, the brand pack's logo is used." />
          <CardBody className="grid gap-6 md:grid-cols-2">
            {(["light", "dark"] as const).map((kind) => (
              <div key={kind} className="flex flex-col gap-3">
                <div className={kind === "light" ? "flex h-28 items-center justify-center rounded-md border border-border bg-white p-4" : "flex h-28 items-center justify-center rounded-md border border-border bg-navy p-4"}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from our own route, sized by the box */}
                  <img src={`/api/company/logo/${kind}?v=${version}`} alt={`Logo for ${kind} backgrounds`} className="max-h-full max-w-full object-contain" />
                </div>
                <span className="flex items-center gap-2 text-callout text-ink-muted">
                  {kind === "light" ? "Light backgrounds" : "Dark backgrounds"}
                  {(kind === "light" ? company.hasLightLogo : company.hasDarkLogo) ? <Badge tone="info">Uploaded</Badge> : <Badge>Standard</Badge>}
                </span>
                <LogoForm kind={kind} custom={kind === "light" ? company.hasLightLogo : company.hasDarkLogo} />
              </div>
            ))}
          </CardBody>
        </Card>

        <Card aria-labelledby="banking-title">
          <CardHeader
            id="banking-title"
            title="Banking"
            description="Where customers pay by bank transfer, per market and currency. Invoices show the account for their market and currency, with the invoice number as the reference."
          />
          {rows.length ? (
            <ul className="divide-y divide-border border-t border-border">
              {rows.map((r) => (
                <li key={r.id} className="px-5 py-4 sm:px-6">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-ink">
                        {marketName.get(r.marketCode) ?? r.marketCode} · {r.currency}
                      </span>
                      <span className="text-callout text-ink-muted">
                        {r.bankName}, {r.accountName}, ending {r.accountNumber.slice(-4)}
                      </span>
                    </summary>
                    <div className="pt-4">
                      <BankAccountForm
                        fixed
                        markets={markets}
                        initial={{
                          marketCode: r.marketCode,
                          currency: r.currency,
                          bankName: r.bankName,
                          branchName: r.branchName ?? "",
                          accountName: r.accountName,
                          accountNumber: r.accountNumber,
                          branchCode: r.branchCode ?? "",
                          swiftCode: r.swiftCode ?? "",
                        }}
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-ink-muted">No bank accounts yet. Invoices show no bank details until one is added.</p>
            </CardBody>
          )}
          <CardBody className="border-t border-border">
            <details>
              <summary className="cursor-pointer font-semibold text-link">Add an account</summary>
              <div className="pt-4">
                <BankAccountForm
                  markets={markets}
                  initial={{ marketCode: defaultMarket?.code ?? "", currency: defaultMarket?.currency ?? "", bankName: "", branchName: "", accountName: "", accountNumber: "", branchCode: "", swiftCode: "" }}
                />
              </div>
            </details>
          </CardBody>
        </Card>

        {whmcs ? (
          <Card aria-labelledby="whmcs-title">
            <CardHeader
              id="whmcs-title"
              title="WHMCS"
              description="Sends these details to WHMCS: its company name, email and Pay To text, the invoice PDF's logo and bank details, its invoice emails, the Openprovider sign-in while Openprovider is on, and maintenance mode pointing customers to the console. Send again after any change here."
            />
            <CardBody>
              <PushCompanyForm />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
