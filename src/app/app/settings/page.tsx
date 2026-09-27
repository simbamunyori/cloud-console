import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { actor, organisation } = await requireMember();
  const editable = can(actor, "manageOrganisation");
  const o = organisation;
  return (
    <>
      <PageHeader title="Settings" description="Your organisation's details. They appear on your invoices." />
      <div className="flex flex-col gap-6">
        <Card aria-labelledby="profile-title">
          <CardHeader id="profile-title" title="Organisation" description={editable ? undefined : "Only owners and admins can change these."} />
          <CardBody>
            <ProfileForm
              editable={editable}
              initial={{
                name: o.name,
                registrationNumber: o.registrationNumber ?? "",
                vatNumber: o.vatNumber ?? "",
                billingEmail: o.billingEmail ?? "",
                phone: o.phone ?? "",
                addressLine1: o.addressLine1 ?? "",
                addressLine2: o.addressLine2 ?? "",
                city: o.city ?? "",
                postcode: o.postcode ?? "",
                defaultPoNumber: o.defaultPoNumber ?? "",
              }}
            />
          </CardBody>
        </Card>
        <Card aria-labelledby="privacy-title">
          <CardHeader id="privacy-title" title="Privacy" />
          <CardBody>
            <p className="text-body text-ink-muted">
              How we handle your organisation&apos;s data, including the support assistant.{" "}
              <Link href="/privacy" className="font-medium text-link hover:underline">
                Read the privacy notice
              </Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
