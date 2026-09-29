import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { bpsToPercent } from "@/server/admin/pricing";
import { prisma } from "@/server/db";
import { CategoryForm } from "../../forms";
import { BackToCatalogue } from "../../parts";

export const metadata: Metadata = { title: "Category" };

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ added?: string }> }) {
  await requireStaffCan("manageCatalogue");
  const [{ key }, { added }] = await Promise.all([params, searchParams]);
  const [c, families] = await Promise.all([prisma.productCategory.findUnique({ where: { key } }), prisma.productFamily.findMany({ orderBy: { sortOrder: "asc" } })]);
  if (!c) notFound();
  return (
    <>
      <BackToCatalogue />
      <PageHeader
        eyebrow="Category"
        title={c.name}
        description={
          <>
            Margin {bpsToPercent(c.marginBps)}%, changed on the{" "}
            <Link href="/admin/pricing" className="text-link underline">
              Pricing page
            </Link>
            .
          </>
        }
      />
      {added ? (
        <div className="mb-6">
          <Alert tone="positive">Added. Now add products to it.</Alert>
        </div>
      ) : null}
      <Card>
        <CardBody>
          <CategoryForm
            existing={c.key}
            families={families.map((f) => ({ value: f.key, label: f.name }))}
            category={{ key: c.key, name: c.name, description: c.description, familyKey: c.familyKey, sortOrder: String(c.sortOrder), margin: "" }}
          />
        </CardBody>
      </Card>
    </>
  );
}
