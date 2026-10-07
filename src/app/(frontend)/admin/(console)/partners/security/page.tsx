import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { PROVIDER_TYPES, providerList } from "@/server/soc/providers";
import { ProviderActiveButton, ProviderForm, TestProviderButton } from "../../soc/forms";

export const metadata: Metadata = { title: "Security provider" };

/** Admin > Partners > Security provider (docs/STRATEGY_ROLLOUT.md, U5): several can be stored, one is active. */
export default async function SecurityProviderPage() {
  await requireStaffCan("managePartners");
  const providers = await providerList(prisma);
  const base = env().APP_URL.replace(/\/+$/, "");
  const types = PROVIDER_TYPES.map((t) => ({ value: t.value, label: t.label }));

  return (
    <>
      <Link href="/admin/partners" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Partners
      </Link>
      <PageHeader
        title="Security provider"
        description="The company behind managed security and the 24/7 SOC. Keys are stored encrypted and never shown again. Customers only ever see Fourth Generation Technologies."
      />
      <div className="flex flex-col gap-6">
        <Alert tone="info">
          Add a provider, test the connection, then make it active. After that, turn on &quot;Managed security&quot; in{" "}
          <Link className="text-link underline" href="/admin/features">
            Features
          </Link>
          . The API contract is in docs/security-provider.md; the partner checklist is in docs/soc-partner-evaluation.md.
        </Alert>
        {providers.map((p) => (
          <Card key={p.id} aria-labelledby={`p-${p.id}`}>
            <CardHeader
              id={`p-${p.id}`}
              title={p.name}
              description={p.lastTestAt ? `Last test ${formatMoment(p.lastTestAt, DEFAULT_TIME_ZONE)}: ${p.lastTestMessage ?? ""}` : "Not tested yet."}
              action={
                <span className="flex flex-wrap gap-2">
                  {p.lastTestOk === false ? <Badge tone="negative">Test failed</Badge> : null}
                  {p.active ? <Badge tone="positive">Active</Badge> : <Badge>Off</Badge>}
                </span>
              }
            />
            <CardBody className="flex flex-col gap-6">
              {p.type === "WEBHOOK" ? (
                <div className="flex flex-col gap-1">
                  <span className="text-callout font-semibold text-ink">Webhook address to give the provider</span>
                  <code className="break-all rounded bg-surface-2 px-2 py-1 text-callout text-ink">{`${base}/api/webhooks/security/${p.id}`}</code>
                  <span className="text-callout text-ink-muted">Signed with the webhook secret: x-signature is the hex HMAC-SHA256 of &quot;x-timestamp.body&quot;.</span>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-6">
                <TestProviderButton id={p.id} />
                <ProviderActiveButton id={p.id} active={p.active} canActivate={p.lastTestOk === true} />
              </div>
              <details>
                <summary className="cursor-pointer text-link">Change settings</summary>
                <div className="pt-4">
                  <ProviderForm types={types} values={{ id: p.id, type: p.type, name: p.name, endpoint: p.endpoint, tenantSettings: p.tenantSettings, customFields: p.customFields, secretsSet: p.secretsSet }} />
                </div>
              </details>
            </CardBody>
          </Card>
        ))}
        <Card aria-labelledby="add-title">
          <CardHeader id="add-title" title={providers.length ? "Add another provider" : "Add a provider"} description="Manual mode works with any provider: our team does each step in its portal." />
          <CardBody>
            <ProviderForm types={types} values={{ id: null, type: "MANUAL", name: "", endpoint: "", tenantSettings: "", customFields: "", secretsSet: { apiKey: false, apiSecret: false, webhookSecret: false } }} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
