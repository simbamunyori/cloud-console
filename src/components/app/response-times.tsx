import type { TicketPriority } from "@prisma/client";
import { cn } from "@/lib/cn";
import { duration } from "@/server/units/units";

export interface PublishedTimes {
  month: string;
  tickets: number;
  byPriority: { priority: TicketPriority; tickets: number; firstResponse: number | null; firstWithin: number | null }[];
  satisfaction: number | null;
  ratings: number;
}

const LABEL: Record<TicketPriority, string> = { URGENT: "Urgent problems", HIGH: "High priority", NORMAL: "Everyday questions", LOW: "Low priority" };

/** Last month's response times (U7), on the console's Support page and the help centre. Shown only once published. */
export function ResponseTimes({ data, className }: { data: PublishedTimes; className?: string }) {
  const month = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <section aria-labelledby="response-times" className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1">
        <h2 id="response-times" className="text-title-2 text-ink">
          How quickly we answered in {month}
        </h2>
        <p className="text-callout text-ink-muted">
          Measured on all {data.tickets} support requests, from when they were sent to our first reply. The typical time is the median: half were answered sooner.
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.byPriority.map((p) =>
          p.firstResponse === null ? null : (
            <div key={p.priority} className="flex flex-col gap-1 rounded-lg border border-border bg-surface-1 p-5">
              <dt className="text-callout text-ink-muted">{LABEL[p.priority]}</dt>
              <dd className="text-title-2 text-ink tabular-nums">{duration(p.firstResponse)}</dd>
              {p.firstWithin !== null ? <dd className="text-caption text-ink-muted">{p.firstWithin}% within our target</dd> : null}
            </div>
          ),
        )}
        {data.satisfaction !== null && data.ratings ? (
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-1 p-5">
            <dt className="text-callout text-ink-muted">Customer satisfaction</dt>
            <dd className="text-title-2 text-ink tabular-nums">{data.satisfaction} out of 5</dd>
            <dd className="text-caption text-ink-muted">From {data.ratings} {data.ratings === 1 ? "rating" : "ratings"}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
