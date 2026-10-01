import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Insight, InsightsStripBlock } from "@/cms/payload-types";
import { insightPath } from "@/cms/collections/insights";
import { topicLabel } from "@/cms/topics";
import { cn } from "@/lib/cn";
import { latestInsights } from "@/server/site/cms";
import { relatedProduct } from "@/server/site/site";
import { CmsTextLink, type BlockContext } from "./blocks/parts";

/** "Resilience · 4 min read" */
export const insightMeta = (i: Pick<Insight, "topic" | "readingMinutes">) => [topicLabel(i.topic), i.readingMinutes ? `${i.readingMinutes} min read` : null].filter(Boolean).join(" · ");

export async function InsightCard({ insight: i, market }: { insight: Insight; market: BlockContext["market"] }) {
  const href = `/${market.code}${insightPath(i.slug)}`;
  const product = await relatedProduct(market.code, i.related);
  const titleId = `insight-${i.id}`;
  const topic = topicLabel(i.topic);
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4.5 lg:gap-3.5 lg:p-7">
      <p className="flex justify-between gap-3 text-caption lg:text-callout">
        {topic ? <span className="font-semibold text-link">{topic}</span> : <span />}
        {i.readingMinutes ? <span className="text-ink-muted">{i.readingMinutes} min read</span> : null}
      </p>
      <h3 id={titleId} className="text-headline text-ink lg:text-title-2">
        {i.title}
      </h3>
      <p className="hidden flex-1 text-body text-ink-muted lg:block">{i.summary}</p>
      <p className="flex items-center justify-between gap-3 text-callout lg:border-t lg:border-border lg:pt-3.5">
        <Link href={href} aria-describedby={titleId} className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
          Read <ArrowRight aria-hidden className="size-4" />
        </Link>
        {product ? (
          <span className="hidden text-ink-muted lg:inline">
            Related:{" "}
            <Link href={product.href} className="hover:text-ink hover:underline">
              {product.name}
            </Link>
          </span>
        ) : null}
      </p>
    </li>
  );
}

/** The three newest published insights for the market, as designed. Hidden while there are none. */
export async function InsightsStripSection({ block: b, ctx }: { block: InsightsStripBlock; ctx: BlockContext }) {
  const insights = await latestInsights(ctx.market.code, b.topic);
  if (!insights.length) return null;
  const panel = b.tone === "light" || b.tone === "dark";
  const more = <CmsTextLink link={b.more} market={ctx.market} arrow className="w-fit text-body" />;
  return (
    <section id={b.anchor ?? undefined} aria-labelledby={`${ctx.id}-title`} className={cn("defer-render scroll-mt-20 border-t border-border", panel && "bg-surface-0")}>
      <div className="page-container flex flex-col gap-6 py-16 lg:gap-14 lg:py-30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4">
            {b.kicker ? <p className="text-caption font-semibold tracking-widest text-link uppercase lg:text-site-kicker">{b.kicker}</p> : null}
            <h2 id={`${ctx.id}-title`} className="max-w-205 text-site-h2-sm text-ink lg:text-site-h2">
              {b.headingPhone ? (
                <>
                  <span className="hidden lg:inline">{b.heading}</span>
                  <span className="lg:hidden">{b.headingPhone}</span>
                </>
              ) : (
                b.heading
              )}
            </h2>
            {b.intro ? <p className="hidden max-w-170 text-site-lead text-ink-muted lg:block">{b.intro}</p> : null}
          </div>
          <div className="hidden shrink-0 lg:block">{more}</div>
        </div>
        <ul className="grid gap-6 lg:grid-cols-3">
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} market={ctx.market} />
          ))}
        </ul>
        <div className="lg:hidden">{more}</div>
      </div>
    </section>
  );
}
