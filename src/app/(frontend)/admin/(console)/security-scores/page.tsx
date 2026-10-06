import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { featureOn } from "@/server/features/features";
import { allScores } from "@/server/security/reports";
import { SCORE_WORD } from "@/server/security/score";

export const metadata: Metadata = { title: "Security scores" };

/** Every customer's security score, lowest first (docs/STRATEGY_ROLLOUT.md, U4): who to call first. */
export default async function SecurityScoresPage() {
  await requireStaffCan("viewCustomers");
  const [rows, on] = await Promise.all([allScores(prisma), featureOn(prisma, "security-score")]);
  return (
    <>
      <PageHeader title="Security scores" description="Every customer's full security score, lowest first, with what is failing. Scored every night." />
      <div className="flex flex-col gap-6">
        {!on ? <Alert tone="info">Scores are worked out once &quot;Full security score and monthly report&quot; is on in Features.</Alert> : null}
        <Card>
          {rows.length === 0 ? (
            <CardBody>
              <p className="text-ink-muted">No customer has been scored yet.</p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-callout">
                <caption className="sr-only">Customers by security score, lowest first</caption>
                <thead className="text-left text-ink-muted">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Customer</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Score</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Failing</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Email domain</th>
                    <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Checked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.organisation.id} className="align-top">
                      <th scope="row" className="px-5 py-3 text-left font-normal sm:px-6">
                        <Link href={`/admin/customers/${r.organisation.id}`} className="font-semibold text-link hover:underline">
                          {r.organisation.name}
                        </Link>
                      </th>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {r.score == null ? (
                          <span className="text-ink-muted">Not yet</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="text-ink tabular-nums">{r.score}</span>
                            <Badge tone={r.score >= 80 ? "positive" : r.score >= 50 ? "warning" : "negative"}>{SCORE_WORD(r.score)}</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-ink">
                        {r.failing.length ? r.failing.join("; ") : <span className="text-ink-muted">Nothing</span>}
                        {r.warnings ? <span className="text-ink-muted"> ({r.warnings} more need attention)</span> : null}
                      </td>
                      <td className="px-3 py-3 text-ink-muted">{r.emailDomain ?? "Not set"}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-ink-muted sm:px-6">{r.scoredAt ? formatMoment(r.scoredAt, DEFAULT_TIME_ZONE) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
