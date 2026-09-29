import type { CatalogueStatus } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/server/catalogue/visibility";

const STATUS_TONE: Record<CatalogueStatus, BadgeTone> = { DRAFT: "neutral", INTERNAL: "warning", LIVE: "positive" };

export function StatusBadge({ status }: { status: CatalogueStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function BackToCatalogue() {
  return (
    <Link href="/admin/catalogue" className="mb-4 inline-flex items-center gap-1 text-callout text-link hover:underline">
      <ArrowLeft aria-hidden className="size-4" /> Catalogue
    </Link>
  );
}
