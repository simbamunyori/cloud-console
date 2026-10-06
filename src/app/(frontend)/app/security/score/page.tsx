import { CircleCheck, CircleHelp, Download, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { formatMoment } from "@/lib/dates";
import { formatMoney } from "@/lib/domain/money";
import { priceDay } from "@/lib/domain/pricing";
import { requireBilling } from "@/server/billing/context";
import { billingAdapter } from "@/server/billing";
import { productBySlug } from "@/server/catalogue/catalogue";
import { productPrice } from "@/server/catalogue/price-book";
import { audienceFor } from "@/server/catalogue/visibility";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { can } from "@/server/org/access";
import { monthLabel } from "@/server/security/reports";
import { GROUP_LABEL, SCORE_WORD, STATUS_LABEL, type ScoreCheck, type ScoreGroup, type ScoreStatus } from "@/server/security/score";
import { refreshSecurityProfile } from "@/server/security/score-facts";
import { emailCheckLookup } from "@/server/tools/lookup";
import { EmailDomainForm, RescoreButton } from "./forms";

export const metadata: Metadata = { title: "Security score" };

const ICON: Record<ScoreStatus, { icon: typeof CircleCheck; className: string }> = {
  pass: { icon: CircleCheck, className: "text-positive" },
  warn: { icon: TriangleAlert, className: "text-warning" },
  fail: { icon: ShieldAlert, className: "text-negative" },
  unknown: { icon: CircleHelp, className: "text-ink-muted" },
};
const TONE = { pass: "positive", warn: "warning", fail: "negative", unknown: "neutral" } as const;
const GROUPS: ScoreGroup[] = ["email", "sign-in", "backup", "devices", "workspace", "team"];

/** The full security score (docs/STRATEGY_ROLLOUT.md, U4): every check, its fix and the product that fixes it. */
export default async function SecurityScorePage() {
  const { db, actor, organisation, market, today } = await requireBilling();
  if (!(await featureOn(prisma, "security-score"))) notFound();
  let profile = await db.securityProfile.findFirst();
  // The first visit scores the account at once; afterwards the nightly run keeps it fresh.
  if (!profile?.checks) {
    await refreshSecurityProfile({ db: prisma, adapter: billingAdapter(), lookup: emailCheckLookup() }, organisation.id);
    profile = await db.securityProfile.findFirst();
  }
  const checks = (Array.isArray(profile?.checks) ? profile.checks : []) as unknown as ScoreCheck[];
  const score = profile?.score ?? 0;
  const reports = await db.securityReport.findMany({ orderBy: { month: "desc" }, take: 12, select: { month: true, score: true } });
  const emailDomain = profile?.emailDomain ?? (profile?.emailReport as { domain?: string } | null)?.domain ?? "";

  // One click to the product that fixes it, at this account's price, only where it is on sale here.
  const ordering = can(actor, "order");
  const audience = audienceFor(organisation);
  const offers = new Map<string, { name: string; price: string; unit: string }>();
  if (ordering) {
    for (const slug of new Set(checks.filter((c) => c.product && c.status !== "pass").map((c) => c.product!.slug))) {
      const product = await productBySlug(prisma, slug, audience);
      const price = product ? await productPrice(prisma, product, market, priceDay(today), audience) : null;
      if (product && price) offers.set(slug, { name: product.name, price: formatMoney(price, organisation.locale), unit: product.unitLabel });
    }
  }
  const tone = score >= 80 ? "bg-positive" : score >= 50 ? "bg-warning" : "bg-negative";
  const todo = checks.filter((c) => c.status === "fail" || c.status === "warn").length;

  return (
    <>
      <PageHeader eyebrow="Security" title="Security score" description="Real checks of your email domain, sign-ins, backups and devices, each with what to do about it." />
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-display-lg text-ink tabular-nums">
                  {score}
                  <span className="text-title-2 font-normal text-ink-muted"> / 100</span>
                </p>
                <Badge tone={score >= 80 ? "positive" : score >= 50 ? "warning" : "negative"}>{SCORE_WORD(score)}</Badge>
              </div>
              <div role="progressbar" aria-label="Security score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className={cn("h-full rounded-full", tone)} style={{ width: `${score}%` }} />
              </div>
              <p className="text-callout text-ink-muted">
                {todo ? `${todo} ${todo === 1 ? "thing needs" : "things need"} doing.` : "Everything we can check is in good shape."}{" "}
                {profile?.scoredAt ? `Checked ${formatMoment(profile.scoredAt, organisation.timeZone)}; we check again every night.` : null}
              </p>
              <RescoreButton />
            </CardBody>
          </Card>
          <Card aria-labelledby="email-domain">
            <CardHeader id="email-domain" title="Email domain we check" description="SPF, DKIM and DMARC stop others sending email as you; we also check the mail servers and the website certificate." />
            <CardBody>
              {can(actor, "manageOrganisation") ? <EmailDomainForm domain={emailDomain} /> : <p className="text-ink">{emailDomain || "Not set yet. Ask an owner or admin to add it."}</p>}
            </CardBody>
          </Card>
        </div>

        {GROUPS.filter((g) => checks.some((c) => c.group === g)).map((g) => (
          <Card key={g} aria-labelledby={`group-${g}`}>
            <CardHeader id={`group-${g}`} title={GROUP_LABEL[g]} />
            <ul className="divide-y divide-border">
              {checks
                .filter((c) => c.group === g)
                .map((c) => {
                  const { icon: Icon, className } = ICON[c.status];
                  const offer = c.product && c.status !== "pass" ? offers.get(c.product.slug) : undefined;
                  return (
                    <li key={c.key} className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-start">
                      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", className)} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink">{c.title}</span>
                          <Badge tone={TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                        </span>
                        <span className="text-callout text-ink-muted">{c.explanation}</span>
                      </div>
                      {c.status !== "pass" && (offer || c.fix) ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-3 lg:justify-end">
                          {offer ? (
                            <Button asChild size="sm">
                              <Link href={`/app/marketplace/${c.product!.slug}${c.product!.quantity ? `?quantity=${c.product!.quantity}` : ""}`}>
                                Add {offer.name}, {offer.price} {offer.unit}
                              </Link>
                            </Button>
                          ) : null}
                          {c.fix ? (
                            <Link href={c.fix.href} className="text-callout font-semibold text-link hover:underline">
                              {c.fix.label}
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </Card>
        ))}

        <Card aria-labelledby="reports-title">
          <CardHeader id="reports-title" title="Monthly reports" description="On the 1st of each month we email owners and admins the month's report as a PDF." />
          {reports.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">Your first report arrives on the 1st of next month.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {reports.map((r) => (
                <li key={r.month} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                  <span className="text-ink">
                    {monthLabel(r.month)}: {r.score} out of 100
                  </span>
                  <a href={`/app/security/score/reports/${r.month}`} className="flex items-center gap-1.5 text-callout font-semibold text-link hover:underline">
                    <Download aria-hidden className="size-4" /> PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
