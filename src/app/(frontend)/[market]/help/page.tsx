import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { helpPath } from "@/cms/collections/help";
import { HELP_SECTIONS } from "@/cms/topics";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { helpArticles } from "@/server/site/cms";
import { siteMarket, siteMetadata } from "@/server/site/site";

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  return siteMetadata(m.code, "/help", { title: `Help centre | ${company.name}`, description: "Answers about domains, email, websites, security, backup, billing and your account." });
}

/** Every help article, by section. Not found while there are none, so nothing empty is ever shown. */
export default async function HelpCentre({ params }: Props) {
  const m = await siteMarket((await params).market);
  const articles = await helpArticles(m.code);
  if (!articles.length) notFound();
  const sections = HELP_SECTIONS.map((s) => ({ ...s, articles: articles.filter((a) => a.section === s.value) })).filter((s) => s.articles.length);
  return (
    <SitePage code={m.code} path="/help">
      <div className="page-container flex flex-col gap-12 py-12 lg:py-16">
        <header className="flex max-w-3xl flex-col gap-3">
          <p className="label-kicker text-link">Help centre</p>
          <h1 className="text-title-1 text-ink sm:text-display">How can we help?</h1>
          <p className="text-body text-ink-muted">
            Answers to common questions. Can&apos;t find yours? Email <a href={`mailto:${m.supportEmail}`} className="font-semibold text-link hover:underline">{m.supportEmail}</a>.
          </p>
        </header>
        <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <section key={s.value} aria-labelledby={`help-${s.value}`} className="flex flex-col gap-4 border-t border-ink pt-6">
              <h2 id={`help-${s.value}`} className="text-title-2 text-ink">
                {s.label}
              </h2>
              <ul className="flex flex-col gap-4">
                {s.articles.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1">
                    <Link href={`/${m.code}${helpPath(a.slug)}`} className="text-headline text-link hover:underline">
                      {a.title}
                    </Link>
                    <p className="text-callout text-ink-muted">{a.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </SitePage>
  );
}
