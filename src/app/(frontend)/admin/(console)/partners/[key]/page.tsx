import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { FEATURES } from "@/server/features/features";
import { isPartnerKey, partnerSummary } from "@/server/partners/partners";
import { FetchCostsButton, PartnerSettingsForm, PartnerSwitch, TestPartnerButton } from "../forms";

export const metadata: Metadata = { title: "Partner" };

export default async function PartnerPage({ params }: { params: Promise<{ key: string }> }) {
  await requireStaffCan("managePartners");
  const { key } = await params;
  if (!isPartnerKey(key)) notFound();
  const p = await partnerSummary(prisma, key);
  const feature = FEATURES[key === "openprovider" ? "openprovider-domains" : "bw-registry-domains"];
  const synced = key === "openprovider" ? await prisma.tld.findFirst({ where: { costSource: "openprovider" }, orderBy: { costSyncedAt: "desc" }, select: { costSyncedAt: true } }) : null;

  return (
    <>
      <Link href="/admin/partners" className="mb-4 inline-flex items-center gap-1 text-callout text-link">
        <ArrowLeft aria-hidden className="size-4" />
        Partners
      </Link>
      <PageHeader title={p.label} description={p.description} actions={p.enabled ? <Badge tone="positive">On</Badge> : <Badge>Off</Badge>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <Card aria-labelledby="settings-title">
          <CardHeader id="settings-title" title="Settings" description="Saving new sign-in details switches the partner off until a test connection works again." />
          <CardBody>
            <PartnerSettingsForm partner={p.key} fields={p.fields} values={p.values} secretsSet={p.secretsSet} />
          </CardBody>
        </Card>
        <div className="flex flex-col gap-6">
          <Card aria-labelledby="test-title">
            <CardHeader
              id="test-title"
              title="Test connection"
              description={
                p.lastTestAt
                  ? `Last test ${formatMoment(p.lastTestAt, DEFAULT_TIME_ZONE)}: ${p.lastTestOk ? "worked" : "failed"}. ${p.lastTestMessage ?? ""}`
                  : "Signs in and reads something harmless. Nothing is registered or changed."
              }
            />
            <CardBody>
              <TestPartnerButton partner={p.key} />
            </CardBody>
          </Card>
          <Card aria-labelledby="switch-title">
            <CardHeader
              id="switch-title"
              title={p.enabled ? "Switched on" : "Switched off"}
              description={`Switching on lets the console use it. Customers see nothing until an Admin also turns on "${feature.label}" in Features.${
                key === "openprovider" ? " Then use Send to WHMCS on the Company page, which gives WHMCS's Openprovider module the same sign-in." : ""
              }`}
            />
            <CardBody>
              <PartnerSwitch partner={p.key} enabled={p.enabled} canEnable={Boolean(p.lastTestOk)} />
            </CardBody>
          </Card>
          {key === "openprovider" ? (
            <Card aria-labelledby="costs-title">
              <CardHeader
                id="costs-title"
                title="Domain costs"
                description={`Our cost for each ending is fetched every morning while domains through Openprovider are on, and selling prices follow the 14-day price books. ${
                  synced?.costSyncedAt ? `Last fetched ${formatMoment(synced.costSyncedAt, DEFAULT_TIME_ZONE)}.` : "Not fetched yet."
                }`}
              />
              <CardBody>
                <FetchCostsButton />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
