import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { launchChecks } from "@/server/launch/checks";

export const metadata: Metadata = { title: "Launch checks" };

/** What is left before customers arrive (Milestone 10). */
export default async function LaunchChecksPage() {
  await requireStaffCan("manageMarkets");
  const { placeholders, checks } = await launchChecks(prisma);
  const left = placeholders.length + checks.filter((c) => !c.done).length;
  return (
    <>
      <PageHeader
        title="Launch checks"
        description={left ? `${left} ${left === 1 ? "thing is" : "things are"} left before customers arrive. The server refuses to start in production while any development placeholder below is still set.` : "Everything is in place."}
      />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="placeholders-title">
          <CardHeader id="placeholders-title" title="Development placeholders" description="Checked when the server starts. Each one says where to fix it." />
          {placeholders.length ? (
            <ul className="divide-y divide-border">
              {placeholders.map((p) => (
                <li key={p} className="flex items-start gap-3 px-6 py-4">
                  <Badge tone="warning">To do</Badge>
                  <span className="min-w-0 break-words text-ink-body">{p}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-6 py-4 text-ink-body">None left.</p>
          )}
        </Card>
        <Card aria-labelledby="checks-title">
          <CardHeader id="checks-title" title="Address, backups and legal text" />
          <ul className="divide-y divide-border">
            {checks.map((c) => (
              <li key={c.key} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-start sm:gap-4">
                <span className="shrink-0">
                  <Badge tone={c.done ? "positive" : "warning"}>{c.done ? "Done" : "To do"}</Badge>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold text-ink">{c.label}</span>
                  <span className="break-words text-callout text-ink-muted">
                    {c.detail}
                    {c.href && !c.done ? (
                      <>
                        {" "}
                        <Link href={c.href} className="text-link underline">
                          Open it
                        </Link>
                      </>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
