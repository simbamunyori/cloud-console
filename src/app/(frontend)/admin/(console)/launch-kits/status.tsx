import { Badge } from "@/components/ui/badge";

type KitState = { draftedAt: Date | null; draftError: string | null; insightId: string | null; pageApprovedAt: Date | null };

/** Where a kit is, in words. */
export function KitStatusBadge({ kit }: { kit: KitState }) {
  if (!kit.draftedAt) return <Badge tone="info">Writing drafts</Badge>;
  if (kit.draftError && !kit.insightId) return <Badge tone="negative">Drafts failed</Badge>;
  if (kit.pageApprovedAt) return <Badge tone="positive">On the website</Badge>;
  return <Badge tone="warning">Waiting for a Publisher</Badge>;
}
