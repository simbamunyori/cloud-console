import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Insight, InsightsStripBlock } from "@/cms/payload-types";
import { insightPath } from "@/cms/collections/insights";
import { topicLabel } from "@/cms/topics";
import { cn } from "@/lib/cn";
import { latestInsights } from "@/server/site/cms";
import { relatedProduct } from "@/server/site/site";
import { cardSurface, CmsTextLink, Heading, Section, type BlockContext } from "./blocks/parts";

/** "Resilience · 4 min read" */
export const insightMeta = (i: Pick<Insight, "topic" | "readingMinutes">) => [topicLabel(i.topic), i.readingMinutes ? `${i.readingMinutes} min read` : null].filter(Boolean).join(" · ");

async function InsightCard({ insight: i, market, tone }: { insight: Insight; market: BlockContext["market"]; tone: InsightsStripBlock["tone"] }) {
  const href = `/${market.code}${insightPath(i.slug)}`;
  const product = await relatedProduct(market.code, i.related);
  const titleId = `insight-${i.id}`;
  return (
    <li className={cn("flex flex-col gap-3 rounded-lg border border-border p-6 xl:p-8", cardSurface(tone))}>
      <p className="label-kicker text-link">{insightMeta(i)}</p>
      <h3 id={titleId} className="text-headline text-ink">
        {i.title}
      </h3>
      <p className="flex-1 text-callout text-ink-muted">{i.summary}</p>
      <Link href={href} aria-describedby={titleId} className="inline-flex w-fit items-center gap-1 text-callout font-semibold text-link hover:underline">
        Read <ArrowRight aria-hidden className="size-4" />
      </Link>
      {product ? (
        <p className="border-t border-border pt-3 text-caption text-ink-muted">
          Related:{" "}
          <Link href={product.href} className="font-medium text-ink hover:underline">
            {product.name}
          </Link>
        </p>
      ) : null}
    </li>
  );
}

/** The three newest published insights for the market. Hidden while there are none. */
export async function InsightsStripSection({ block: b, ctx }: { block: InsightsStripBlock; ctx: BlockContext }) {
  const insights = await latestInsights(ctx.market.code, b.topic);
  if (!insights.length) return null;
  return (
    <Section tone={b.tone} labelledBy={`${ctx.id}-title`}>
      <Heading id={`${ctx.id}-title`} tone={b.tone} kicker={b.kicker} heading={b.heading} intro={b.intro} />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:mt-12 xl:gap-6">
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} market={ctx.market} tone={b.tone} />
        ))}
      </ul>
      {b.more?.label ? (
        <p className="mt-8">
          <CmsTextLink link={b.more} market={ctx.market} />
        </p>
      ) : null}
    </Section>
  );
}
