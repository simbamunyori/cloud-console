import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { PARTNERS, partnerSummary, type PartnerKey } from "@/server/partners/partners";

export const metadata: Metadata = { title: "Partners" };

export default async function PartnersPage() {
  await requireStaffCan("managePartners");
  const partners = await Promise.all((Object.keys(PARTNERS) as PartnerKey[]).map((k) => partnerSummary(prisma, k)));
  return (
    <>
      <PageHeader
        title="Partners"
        description="The companies that deliver services for us. Their sign-in details are stored encrypted and never shown again. Customers only ever see Fourth Generation Technologies."
      />
      <Card>
        <ul className="divide-y divide-border">
          {partners.map((p) => (
            <li key={p.key}>
              <Link href={`/admin/partners/${p.key}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-2 sm:px-6">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-ink">{p.label}</span>
                  <span className="text-callout text-ink-muted">{p.description}</span>
                </span>
                <span className="flex flex-wrap justify-end gap-2">
                  {p.lastTestOk === false ? <Badge tone="negative">Test failed</Badge> : null}
                  {!p.updatedAt ? <Badge>Not set up</Badge> : p.enabled ? <Badge tone="positive">On</Badge> : <Badge>Off</Badge>}
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
