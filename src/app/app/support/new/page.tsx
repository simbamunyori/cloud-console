import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireBilling } from "@/server/billing/context";
import { assertCan } from "@/server/org/access";
import { NewTicketForm } from "../forms";

export const metadata: Metadata = { title: "Ask our team" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { billing, actor } = await requireBilling();
  assertCan(actor, "support");
  const { service } = await searchParams;
  const services = (await billing.listServices()).filter((s) => s.status !== "cancelled" && s.status !== "terminated");
  return (
    <>
      <Link href="/app/support" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Support
      </Link>
      <PageHeader title="Ask our team" description="A person reads every ticket. We reply by email and here, usually within one working day." />
      <Card className="max-w-2xl">
        <CardBody>
          <NewTicketForm services={services.map((s) => ({ value: s.serviceId, label: s.domain ? `${s.name} (${s.domain})` : s.name }))} service={service} />
        </CardBody>
      </Card>
    </>
  );
}
