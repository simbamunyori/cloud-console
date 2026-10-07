import { ArrowRight, CircleCheck, Circle } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import type { WelcomeItem } from "@/server/experience/experience";
import { HideWelcomeButton } from "./welcome-hide";

/** A new customer's first-week checklist (STRATEGY_ROLLOUT U11). Each item ticks itself once done. */
export function WelcomeChecklist({ items, done }: { items: WelcomeItem[]; done: number }) {
  return (
    <Card aria-labelledby="welcome-title">
      <CardHeader id="welcome-title" title="Your first week" description={`${done} of ${items.length} done. These get you set up properly.`} action={<HideWelcomeButton />} />
      <ol className={`grid grid-cols-1 divide-y divide-border md:divide-y-0 ${items.length === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
        {items.map((item) => (
          <li key={item.key} className={items.length === 4 ? "md:border-t md:border-border xl:border-t-0 xl:border-l xl:first:border-l-0" : "md:border-l md:border-border md:first:border-l-0"}>
            <Link href={item.href} className="flex h-full items-start gap-3 px-5 py-4 hover:bg-surface-2 sm:px-6">
              {item.done ? <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-positive" /> : <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`font-semibold ${item.done ? "text-ink-muted line-through" : "text-ink"}`}>
                  {item.title}
                  <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                </span>
                <span className="text-callout text-ink-muted">{item.text}</span>
              </span>
              {item.done ? null : <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-link" />}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
