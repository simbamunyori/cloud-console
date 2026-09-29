import { SquarePen } from "lucide-react";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/server/admin/context";

export const metadata: Metadata = { title: "Website editor" };

/** Where staff without a website role land when they open the editor. */
export default async function WebsiteAccessPage() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Website editor" />
      <Card>
        <EmptyState icon={SquarePen} title="You can't change the website yet">
          An Admin can make you an Editor or a Publisher on the Staff page.
        </EmptyState>
      </Card>
    </>
  );
}
