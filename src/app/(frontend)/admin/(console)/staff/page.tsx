import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { STAFF_ROLE_LABEL, WEBSITE_ROLE_LABEL } from "@/server/staff/access";
import { staffList } from "@/server/staff/website-roles";
import { WebsiteRoleForm } from "./forms";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const { staff } = await requireStaffCan("manageStaff");
  const people = await staffList(prisma, staff);
  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can change the website. Editors save drafts; Publishers also publish, schedule, restore earlier versions and approve legal text. Admins can always publish."
      />
      <Card>
        <ul className="divide-y divide-border">
          {people.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-ink">{p.name}</span>
                <span className="text-callout break-words text-ink-muted">
                  {p.email} · {p.staffRole ? STAFF_ROLE_LABEL[p.staffRole] : "No staff role"}
                </span>
              </span>
              {p.staffRole === "ADMIN" ? (
                <Badge tone="neutral">{WEBSITE_ROLE_LABEL.PUBLISHER}, as an Admin</Badge>
              ) : (
                <WebsiteRoleForm userId={p.id} name={p.name} current={p.websiteRole ?? "NONE"} />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
