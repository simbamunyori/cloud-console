import type { LeadStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  if (status === "NEW") return <Badge tone="warning">New</Badge>;
  if (status === "CONTACTED") return <Badge tone="positive">Contacted</Badge>;
  return <Badge>Closed</Badge>;
}
