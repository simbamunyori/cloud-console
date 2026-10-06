import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay, formatMonth } from "@/lib/dates";
import { formatMoney, money } from "@/lib/domain/money";
import { requireStaff } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { DomainError } from "@/server/org/access";
import { KIND_LABEL, payoutDetailsFor, referralSettings, referralsOn, STATUS_LABEL, type StatementLine } from "@/server/referrals/referrals";
import { staffCan } from "@/server/staff/access";
import { DecideForm, PartnerForm, PayoutForm, SettingsForm } from "./forms";

export const metadata: Metadata = { title: "Referral partners" };

const m = (minor: bigint, currency: string) => formatMoney(money(minor, currency), "en-BW");
const monthLabel = (month: string) => formatMonth(new Date(`${month}-01T00:00:00Z`));

/** Referral partners (U9): Admins approve them and set commission; Finance records payouts. */
export default async function ReferralsPage() {
  const { staff } = await requireStaff();
  const manage = staffCan(staff, "managePartners");
  const pay = staffCan(staff, "confirmPayments");
  if (!manage && !pay) throw new DomainError("forbidden", "Your staff role doesn't allow that.");
  const [on, settings, partners, due, paid] = await Promise.all([
    referralsOn(prisma),
    referralSettings(prisma),
    prisma.referralPartner.findMany({ where: { status: { not: "DECLINED" } }, orderBy: [{ status: "asc" }, { company: "asc" }], include: { _count: { select: { referrals: true } } } }),
    prisma.referralStatement.findMany({ where: { status: "DUE" }, orderBy: { month: "asc" }, include: { partner: true } }),
    prisma.referralStatement.findMany({ where: { status: "PAID" }, orderBy: { paidAt: "desc" }, take: 20, include: { partner: { select: { company: true } } } }),
  ]);
  const defaultPercent = String(settings.commissionBps / 100);
  const applied = partners.filter((p) => p.status === "APPLIED");
  const current = partners.filter((p) => p.status !== "APPLIED");

  return (
    <>
      <PageHeader
        title="Referral partners"
        description={`Accountants, consultants and IT resellers who refer customers. Statements are worked out on the 3rd of each month from what their customers paid us.${on ? "" : " The programme is off: turn on Referral partners in Features to open the page on the website."}`}
      />
      <div className="flex flex-col gap-6">
        {pay && due.length ? (
          <Card aria-labelledby="due-title">
            <CardHeader id="due-title" title={`To pay (${due.length})`} description="Pay each partner by EFT, then record the bank's reference here. The partner is emailed." />
            <ul className="divide-y divide-border">
              {due.map((s) => {
                const bank = payoutDetailsFor(s.partner.payoutDetails);
                return (
                  <li key={s.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:px-6">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-semibold text-ink">
                        {s.partner.company}, {monthLabel(s.month)}: {m(s.commissionMinor, s.currency)}
                      </span>
                      <span className="text-callout text-ink-muted">
                        {s.rateBps / 100}% of {m(s.paidInMinor, s.currency)} paid by {(s.lines as unknown as StatementLine[]).map((l) => l.organisation).join(", ")}
                      </span>
                      {bank ? <span className="text-callout whitespace-pre-line text-ink">{bank}</span> : <Badge tone="warning">No bank details yet</Badge>}
                    </div>
                    <PayoutForm statementId={s.id} />
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {manage && applied.length ? (
          <Card aria-labelledby="applied-title">
            <CardHeader id="applied-title" title={`Applications (${applied.length})`} description="Leave commission blank to use the default." />
            <ul className="divide-y divide-border">
              {applied.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:px-6">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold text-ink">{p.company}</span>
                    <span className="text-callout text-ink-muted">
                      {KIND_LABEL[p.kind]}, {p.name}, {p.email}
                      {p.phone ? `, ${p.phone}` : ""}. Applied {formatDay(p.createdAt, true)}.
                    </span>
                  </span>
                  <DecideForm id={p.id} defaultPercent={defaultPercent} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card aria-labelledby="partners-title">
          <CardHeader id="partners-title" title={`Partners (${current.length})`} />
          {current.length ? (
            <ul className="divide-y divide-border">
              {current.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:px-6">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{p.company}</span>
                      <Badge tone={p.status === "ACTIVE" ? "positive" : "warning"}>{STATUS_LABEL[p.status]}</Badge>
                    </span>
                    <span className="text-callout text-ink-muted">
                      {KIND_LABEL[p.kind]}, {p.email}. Code {p.code}. {p._count.referrals} {p._count.referrals === 1 ? "customer" : "customers"}. {p.commissionBps === null ? `Default commission (${defaultPercent}%)` : `${p.commissionBps / 100}% commission`}.
                    </span>
                  </span>
                  {manage ? <PartnerForm id={p.id} status={p.status} commission={p.commissionBps === null ? "" : String(p.commissionBps / 100)} defaultPercent={defaultPercent} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-ink-muted">No partners yet.</p>
            </CardBody>
          )}
        </Card>

        {paid.length ? (
          <Card aria-labelledby="paid-title">
            <CardHeader id="paid-title" title="Paid recently" />
            <ul className="divide-y divide-border">
              {paid.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-callout sm:px-6">
                  <span className="text-ink">
                    {s.partner.company}, {monthLabel(s.month)}: {m(s.commissionMinor, s.currency)}
                  </span>
                  <span className="text-ink-muted">
                    {s.paidAt ? formatDay(s.paidAt, true) : ""}, {s.paymentRef}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {manage ? (
          <Card aria-labelledby="settings-title">
            <CardHeader id="settings-title" title="Default commission" description="A share of what each partner's customers pay us each month. A partner's own rate, set above, takes its place." />
            <CardBody>
              <SettingsForm percent={defaultPercent} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
