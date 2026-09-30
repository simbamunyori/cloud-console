import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InsightCard } from "@/components/site/insights";
import { SitePage } from "@/components/site/site-page";
import { INSIGHT_TOPICS } from "@/cms/topics";
import { company } from "@/config/app";
import { cn } from "@/lib/cn";
import { latestInsights } from "@/server/site/cms";
import { siteMarket, siteMetadata } from "@/server/site/site";

type Props = { params: Promise<{ market: string }>; searchParams: Promise<{ topic?: string | string[] }> };

const topicOf = (v: string | string[] | undefined) => INSIGHT_TOPICS.find((t) => t.value === (Array.isArray(v) ? v[0] : v)) ?? null;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  const topic = topicOf((await searchParams).topic);
  const meta = await siteMetadata(m.code, "/insights", {
    title: `${topic ? `${topic.label} insights` : "Insights"} | ${company.name}`,
    description: "Practical advice on security, backup, email and running your business online, from the team that looks after it.",
  });
  // A topic is a filtered view of the one page.
  return topic ? { ...meta, robots: { index: false, follow: true } } : meta;
}

/**
 * Every published insight for the market, newest first, with topics to
 * narrow them (Milestone 7). Not in the main navigation: the home page
 * strip, the footer and the Support menu link here.
 */
export default async function InsightsPage({ params, searchParams }: Props) {
  const m = await siteMarket((await params).market);
  const topic = topicOf((await searchParams).topic);
  const [all, shown] = await Promise.all([latestInsights(m.code, null, 200), topic ? latestInsights(m.code, topic.value, 200) : null]);
  // Nothing published yet: the page hides itself, as its links do.
  if (!all.length) notFound();
  const insights = shown ?? all;
  // Only topics that have something to read.
  const topics = INSIGHT_TOPICS.filter((t) => all.some((i) => i.topic === t.value));
  const chip = "inline-flex h-9 items-center whitespace-nowrap rounded-full border px-4 text-callout font-semibold";
  return (
    <SitePage code={m.code} path="/insights">
      <div className="page-container flex flex-col gap-8 py-12 lg:gap-12 lg:py-16">
        <header className="flex max-w-3xl flex-col gap-3">
          <p className="label-kicker text-link">Insights</p>
          <h1 className="text-title-1 text-ink sm:text-display xl:text-display-lg">Advice from the team that looks after it.</h1>
          <p className="text-body text-ink-muted xl:text-headline xl:font-normal">Practical articles on security, backup, email and running your business online. Once a month, the newest ones go to subscribers.</p>
        </header>
        {topics.length > 1 ? (
          <nav aria-label="Topics" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex gap-2">
              <li>
                <Link href={`/${m.code}/insights`} aria-current={topic ? undefined : "page"} className={cn(chip, topic ? "border-border bg-surface-0 text-ink hover:border-border-strong hover:bg-surface-2" : "border-navy bg-navy text-on-navy")}>
                  All
                </Link>
              </li>
              {topics.map((t) => {
                const on = topic?.value === t.value;
                return (
                  <li key={t.value}>
                    <Link href={`/${m.code}/insights?topic=${t.value}`} aria-current={on ? "page" : undefined} className={cn(chip, on ? "border-navy bg-navy text-on-navy" : "border-border bg-surface-0 text-ink hover:border-border-strong hover:bg-surface-2")}>
                      {t.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
        <h2 className="sr-only">{topic ? `${topic.label} articles` : "Articles"}</h2>
        {insights.length ? (
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((i) => (
              <InsightCard key={i.id} insight={i} market={m} />
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-muted">
            Nothing here yet.{" "}
            <Link href={`/${m.code}/insights`} className="font-semibold text-link hover:underline">
              See every insight
            </Link>
          </p>
        )}
      </div>
    </SitePage>
  );
}
