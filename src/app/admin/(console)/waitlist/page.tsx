import { Hourglass } from "lucide-react";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { countryName } from "@/lib/countries";
import { formatDay } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { waitlist } from "@/server/markets/waitlist";
import { ContactedButton } from "../markets/forms";

export const metadata: Metadata = { title: "Waiting list" };

export default async function WaitlistPage() {
  const { staff } = await requireStaffCan("viewCustomers");
  const entries = await waitlist(prisma, staff);
  const byCountry = new Map<string, number>();
  for (const e of entries) byCountry.set(e.country, (byCountry.get(e.country) ?? 0) + 1);
  const top = [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Waiting list"
        description={
          top.length
            ? `People who tried to sign up from a country we don't serve yet. Most asked: ${top.map(([c, n]) => `${countryName(c)} (${n})`).join(", ")}.`
            : "People who tried to sign up from a country we don't serve yet."
        }
      />
      <Card>
        {entries.length === 0 ? (
          <EmptyState icon={Hourglass} title="Nobody is waiting">
            When someone signs up from a country without a market, their details appear here.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:px-6">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-ink">
                    {e.name}
                    {e.company ? <span className="font-normal text-ink-muted">, {e.company}</span> : null}
                  </span>
                  <span className="text-callout break-words text-ink-muted">
                    {countryName(e.country)} · {e.email}
                    {e.phone ? ` · ${e.phone}` : ""} · {formatDay(e.createdAt, true)}
                  </span>
                  {e.message ? <span className="mt-1 text-callout whitespace-pre-line text-ink">{e.message}</span> : null}
                </span>
                {e.contactedAt ? (
                  <span className="text-callout text-ink-muted">
                    Contacted by {e.contactedBy}, {formatDay(e.contactedAt, true)}
                  </span>
                ) : (
                  <ContactedButton id={e.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
