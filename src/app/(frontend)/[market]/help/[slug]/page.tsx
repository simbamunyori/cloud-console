import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { helpPath } from "@/cms/collections/help";
import { helpSectionLabel } from "@/cms/topics";
import { SiteRichText } from "@/components/site/rich-text";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { helpArticle } from "@/server/site/cms";
import { siteMarket, siteMetadata } from "@/server/site/site";

type Props = { params: Promise<{ market: string; slug: string }> };

async function load({ params }: Props) {
  const { market, slug } = await params;
  const m = await siteMarket(market);
  const article = await helpArticle(m.code, slug);
  if (!article) notFound();
  return { m, article };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { m, article } = await load(props);
  return siteMetadata(m.code, helpPath(article.slug), { title: `${article.title} | ${company.name}`, description: article.summary });
}

export default async function HelpArticlePage(props: Props) {
  const { m, article: a } = await load(props);
  return (
    <SitePage code={m.code} path={helpPath(a.slug)}>
      <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 lg:py-16">
        <nav aria-label="Breadcrumb" className="text-callout">
          <Link href={`/${m.code}/help`} className="font-semibold text-link hover:underline">
            Help centre
          </Link>
          <span className="text-ink-muted"> / {helpSectionLabel(a.section)}</span>
        </nav>
        <header className="flex flex-col gap-3">
          <h1 className="text-title-1 text-ink sm:text-display">{a.title}</h1>
          <p className="text-body text-ink-muted xl:text-headline xl:font-normal">{a.summary}</p>
        </header>
        <SiteRichText data={a.body} market={m} style="prose" />
        <aside className="rounded-md border border-border bg-surface-1 p-6 text-body text-ink-body">
          Still stuck? Email{" "}
          <a href={`mailto:${m.supportEmail}`} className="font-semibold text-link hover:underline">
            {m.supportEmail}
          </a>
          {m.supportPhone ? (
            <>
              {" "}
              or call{" "}
              <a href={`tel:${m.supportPhone.replace(/\s/g, "")}`} className="font-semibold text-link hover:underline">
                {m.supportPhone}
              </a>
            </>
          ) : null}
          .
        </aside>
      </article>
    </SitePage>
  );
}
