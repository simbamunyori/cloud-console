import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { FamilyForm } from "../../forms";
import { BackToCatalogue, StatusBadge } from "../../parts";
import { CONNECTOR_OPTIONS } from "../options";

export const metadata: Metadata = { title: "Product family" };

export default async function FamilyPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ added?: string }> }) {
  await requireStaffCan("manageCatalogue");
  const [{ key }, { added }] = await Promise.all([params, searchParams]);
  const f = await prisma.productFamily.findUnique({ where: { key } });
  if (!f) notFound();
  return (
    <>
      <BackToCatalogue />
      <PageHeader eyebrow="Product family" title={f.name} actions={<StatusBadge status={f.status} />} />
      {added ? (
        <div className="mb-6">
          <Alert tone="positive">Added. Now add a category to it.</Alert>
        </div>
      ) : null}
      <Card>
        <CardBody>
          <FamilyForm
            existing={f.key}
            connectors={CONNECTOR_OPTIONS}
            family={{ key: f.key, name: f.name, description: f.description, connector: f.connector, status: f.status, fulfilment: f.fulfilment ?? "", sortOrder: String(f.sortOrder) }}
          />
        </CardBody>
      </Card>
    </>
  );
}
