import { Rocket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDay } from "@/lib/dates";
import { requireWebsiteStaff } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { listKits, productsWithoutKit } from "@/server/launch/kits";
import { StartKitForm } from "./forms";
import { KitStatusBadge } from "./status";

export const metadata: Metadata = { title: "Launch kits" };

export default async function LaunchKitsPage() {
  const { actor } = await requireWebsiteStaff();
  const [kits, waiting] = await Promise.all([listKits(prisma, actor), productsWithoutKit(prisma, actor)]);
  return (
    <>
      <PageHeader
        title="Launch kits"
        description="When a product goes live, its kit is prepared: the product page, an insight draft, a LinkedIn post and tracked links. Editors change the words; a Publisher approves each part before it goes out."
      />
      <div className="flex flex-col gap-6">
        {waiting.length ? (
          <Card aria-labelledby="start-title">
            <CardHeader id="start-title" title="Live products without a kit" description="These went live before kits existed, or their kit was removed." />
            <CardBody>
              <StartKitForm products={waiting} />
            </CardBody>
          </Card>
        ) : null}
        {kits.length === 0 ? (
          <Card>
            <EmptyState icon={Rocket} title="No launch kits yet">
              Make a product live in the catalogue and its kit appears here, with first drafts a few minutes later.
            </EmptyState>
          </Card>
        ) : (
          <Card aria-labelledby="kits-title">
            <CardHeader id="kits-title" title={`Kits (${kits.length})`} />
            <ul className="divide-y divide-border">
              {kits.map((k) => (
                <li key={k.id}>
                  <Link href={`/admin/launch-kits/${k.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-ink">{k.product.name}</span>
                      <span className="text-caption text-ink-muted">
                        {k.product.markets.map((m) => m.toUpperCase()).join(", ")} · started {formatDay(k.createdAt, true)}
                      </span>
                    </span>
                    <span className="self-start sm:self-center">
                      <KitStatusBadge kit={k} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
