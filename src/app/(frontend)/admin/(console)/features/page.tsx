import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { featureList } from "@/server/features/features";
import { FeatureToggle } from "./forms";

export const metadata: Metadata = { title: "Features" };

export default async function FeaturesPage() {
  await requireStaffCan("manageFeatures");
  const features = await featureList(prisma);
  return (
    <>
      <PageHeader
        title="Features"
        description="New features arrive switched off and stay hidden from customers until an Admin turns them on here. Every change is in the staff activity log."
      />
      <Card>
        <ul className="divide-y divide-border">
          {features.map((f) => (
            <li key={f.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-6 sm:px-6">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{f.label}</span>
                  {f.enabled ? <Badge tone="positive">On</Badge> : <Badge>Off</Badge>}
                  <span className="text-caption text-ink-muted">{f.milestone}</span>
                </span>
                <span className="text-callout text-ink-muted">{f.description}</span>
                {f.updatedAt ? (
                  <span className="text-caption text-ink-muted">
                    Last changed {formatMoment(f.updatedAt, DEFAULT_TIME_ZONE)}
                    {f.updatedBy ? ` by ${f.updatedBy}` : ""}
                  </span>
                ) : null}
              </span>
              <FeatureToggle id={f.key} label={f.label} enabled={f.enabled} />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
