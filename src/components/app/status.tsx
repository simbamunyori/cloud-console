import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { DomainStatus, InvoiceStatus, ServiceStatus } from "@/server/billing/adapter";

const SERVICE: Record<ServiceStatus, [string, BadgeTone]> = {
  pending: ["Being set up", "info"],
  active: ["Active", "positive"],
  suspended: ["Paused", "negative"],
  terminated: ["Ended", "neutral"],
  cancelled: ["Cancelled", "neutral"],
};

const INVOICE: Record<InvoiceStatus, [string, BadgeTone]> = {
  draft: ["Draft", "neutral"],
  unpaid: ["To pay", "warning"],
  paid: ["Paid", "positive"],
  cancelled: ["Cancelled", "neutral"],
  refunded: ["Refunded", "neutral"],
  collections: ["Overdue", "negative"],
  payment_pending: ["Payment on its way", "info"],
};

const DOMAIN: Record<DomainStatus, [string, BadgeTone]> = {
  pending: ["Being registered", "info"],
  pending_transfer: ["Transferring", "info"],
  active: ["Active", "positive"],
  expired: ["Expired", "negative"],
  cancelled: ["Cancelled", "neutral"],
  transferred_away: ["Moved away", "neutral"],
};

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  const [label, tone] = SERVICE[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  if (overdue) return <Badge tone="negative">Overdue</Badge>;
  const [label, tone] = INVOICE[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function DomainStatusBadge({ status }: { status: DomainStatus }) {
  const [label, tone] = DOMAIN[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** How full something is, with the numbers in words beside it. */
export function UsageBar({ label, used, limit, unit }: { label: string; used: number; limit: number | null; unit: string }) {
  const share = limit ? Math.min(1, used / limit) : null;
  const tone = share === null ? "bg-brand" : share >= 0.9 ? "bg-negative" : share >= 0.75 ? "bg-warning" : "bg-brand";
  const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4 text-callout">
        <span className="text-ink">{label}</span>
        <span className="text-ink-muted tabular-nums">
          {fmt(used)} {unit}
          {limit ? ` of ${fmt(limit)} ${unit}` : ""}
        </span>
      </div>
      {share !== null ? (
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit ?? 0} aria-valuenow={used}>
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
        </div>
      ) : null}
    </div>
  );
}

const ORDER: Record<"SETTING_UP" | "ACTIVE" | "CANCELLED" | "FAILED", [string, BadgeTone]> = {
  SETTING_UP: ["Being set up", "info"],
  ACTIVE: ["Ready", "positive"],
  CANCELLED: ["Cancelled", "neutral"],
  FAILED: ["Couldn't be set up", "negative"],
};

export function OrderStatusBadge({ status }: { status: keyof typeof ORDER }) {
  const [label, tone] = ORDER[status];
  return <Badge tone={tone}>{label}</Badge>;
}
