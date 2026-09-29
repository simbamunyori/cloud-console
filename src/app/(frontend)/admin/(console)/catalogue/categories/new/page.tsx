import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { CategoryForm } from "../../forms";
import { BackToCatalogue } from "../../parts";

export const metadata: Metadata = { title: "Add a category" };

export default async function NewCategoryPage({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  await requireStaffCan("manageCatalogue");
  const [{ family }, families] = await Promise.all([searchParams, prisma.productFamily.findMany({ orderBy: { sortOrder: "asc" } })]);
  return (
    <>
      <BackToCatalogue />
      <PageHeader title="Add a category" description="Categories are the headings customers see in the marketplace and on the pricing page." />
      <Card>
        <CardBody>
          <CategoryForm
            families={families.map((f) => ({ value: f.key, label: f.name }))}
            category={{ key: "", name: "", description: "", familyKey: family ?? families[0]?.key ?? "", sortOrder: "100", margin: "" }}
          />
        </CardBody>
      </Card>
    </>
  );
}
