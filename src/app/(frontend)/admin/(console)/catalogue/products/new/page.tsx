import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { ProductForm } from "../../forms";
import { BackToCatalogue } from "../../parts";
import { productFormOptions } from "../options";

export const metadata: Metadata = { title: "Add a product" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  await requireStaffCan("manageCatalogue");
  const [{ category }, options] = await Promise.all([searchParams, productFormOptions(prisma)]);
  // A family that sells everything one way (Connectivity: by quote) sets the default.
  const familyFulfilment = category ? (await prisma.productCategory.findUnique({ where: { key: category }, select: { family: { select: { fulfilment: true } } } }))?.family.fulfilment : null;
  return (
    <>
      <BackToCatalogue />
      <PageHeader title="Add a product" description="A new product starts as a draft. Approve its prices on the Pricing page, preview it, then make it internal or live." />
      <Card>
        <CardBody>
          <ProductForm
            {...options}
            product={{
              slug: "",
              name: "",
              summary: "",
              includes: "",
              excludes: "",
              categoryKey: category ?? options.categories[0]?.value ?? "",
              unitLabel: "per organisation",
              quantityAllowed: false,
              minQuantity: "1",
              setupHours: "8",
              minTermMonths: "1",
              commitmentNote: "",
              cost: "",
              costCurrency: options.currencies[0]?.value ?? "",
              fixedPrice: "",
              fixedPriceCurrency: options.currencies[0]?.value ?? "",
              markets: options.markets.map((m) => m.value),
              fulfilment: familyFulfilment ?? "MANUAL",
              status: "DRAFT",
              sortOrder: "100",
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
