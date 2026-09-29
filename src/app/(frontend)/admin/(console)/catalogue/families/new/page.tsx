import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { FamilyForm } from "../../forms";
import { BackToCatalogue } from "../../parts";
import { CONNECTOR_OPTIONS } from "../options";

export const metadata: Metadata = { title: "Add a product family" };

export default async function NewFamilyPage() {
  await requireStaffCan("manageCatalogue");
  return (
    <>
      <BackToCatalogue />
      <PageHeader title="Add a product family" description="A family groups categories fulfilled by one connector. It starts as a draft, so nothing in it shows until you make it internal or live." />
      <Card>
        <CardBody>
          <FamilyForm connectors={CONNECTOR_OPTIONS} family={{ key: "", name: "", description: "", connector: "SERVICES", status: "DRAFT", sortOrder: "100" }} />
        </CardBody>
      </Card>
    </>
  );
}
