import type {
  CallToActionBlock,
  DomainSearchBlock,
  FaqBlock,
  FeatureCardsBlock,
  HeroBlock,
  ImageTextBlock,
  LogoStripBlock,
  Page,
  PageIntroBlock,
  PricingBlock,
  ServicesGridBlock,
  TestimonialsBlock,
  TextBlock,
} from "@/cms/payload-types";
import { domainQuickPicks, withDataCentre } from "@/config/site";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/domain/money";
import { selection } from "@/server/cms/catalogue-options";
import { lowestPrice, selected, siteMarket, sitePrices, taxNote } from "@/server/site/site";
import { CATCH_ALL } from "@/lib/domain/markets";
import { DomainSearch, type HomeMarket } from "../home";
import { SiteHero } from "../hero";
import { AssistantNotice as AssistantNoticeText, PageIntro as PageIntroHeader, ProseSection } from "../prose";
import { fill, SiteRichText, type TextMarket } from "../rich-text";
import {
  BlockIcon,
  captionFor,
  cardSurface,
  CmsButton,
  CmsTextLink,
  Heading,
  hasPicture,
  MediaImage,
  PictureBody,
  Section,
  type BlockContext,
  type PictureValue,
} from "./parts";

/**
 * Draws a page's sections from the website editor, with the brand's own
 * components. Prices always come live from the market's price book.
 */

function Hero({ block: b, ctx }: { block: HeroBlock; ctx: BlockContext }) {
  const picture = b.picture as PictureValue | undefined;
  const actions =
    b.primary?.label || b.secondary?.label ? (
      <>
        <CmsButton link={b.primary} market={ctx.market} />
        <CmsButton link={b.secondary} market={ctx.market} variant="secondary" />
      </>
    ) : null;
  return (
    <SiteHero
      id={`${ctx.id}-title`}
      kicker={b.kicker}
      heading={b.heading}
      sub={b.sub}
      search={b.domainSearch ? domainQuickPicks(ctx.market.highlightedTlds) : null}
      actions={actions}
      supporting={(b.supporting ?? []).map((s) => s.text)}
      picture={hasPicture(picture) ? <PictureBody picture={picture} market={ctx.market} hero /> : null}
      caption={hasPicture(picture) ? picture.caption : null}
    />
  );
}

function DomainSearchSection({ block: b, ctx }: { block: DomainSearchBlock; ctx: BlockContext }) {
  return (
    <div className="page-container py-12">
      <DomainSearch tlds={domainQuickPicks(ctx.market.highlightedTlds)} heading={b.heading || undefined} intro={b.intro || undefined} />
    </div>
  );
}

const gridCols = (n: number) => (n % 3 === 0 && n % 4 !== 0 ? "lg:grid-cols-3" : "lg:grid-cols-4");

function FeatureCards({ block: b, ctx }: { block: FeatureCardsBlock; ctx: BlockContext }) {
  const raised = b.style === "raised";
  const items = b.items ?? [];
  return (
    <Section tone={b.tone} labelledBy={`${ctx.id}-title`}>
      <Heading id={`${ctx.id}-title`} tone={b.tone} kicker={b.kicker} heading={b.heading} intro={b.intro} />
      <ul className={cn("mt-10 grid gap-4 sm:grid-cols-2 xl:mt-12 xl:gap-6", gridCols(items.length))}>
        {items.map((it) => (
          <li key={it.id ?? it.title} className={cn("flex flex-col gap-3 rounded-lg border border-border p-6 text-ink", cardSurface(b.tone), raised && "shadow-elevation-1")}>
            {raised ? (
              <span className="flex size-10 items-center justify-center rounded-md bg-brand-soft text-link">
                <BlockIcon name={it.icon} className="size-5" />
              </span>
            ) : (
              <BlockIcon name={it.icon} className="size-6 text-link" />
            )}
            <h3 className="text-headline text-ink">{it.title}</h3>
            {it.body ? <p className="text-callout text-ink-muted">{it.body}</p> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

async function ServicesGrid({ block: b, ctx }: { block: ServicesGridBlock; ctx: BlockContext }) {
  const [prices, market] = await Promise.all([sitePrices(ctx.market.code), siteMarket(ctx.market.code)]);
  const tax = b.showTaxNote ? taxNote(market) : null;
  const intro = [b.intro, tax].filter(Boolean).join(" ");
  return (
    <Section tone={b.tone} id={b.anchor} labelledBy={`${ctx.id}-title`}>
      <Heading id={`${ctx.id}-title`} tone={b.tone} kicker={b.kicker} heading={b.heading} intro={intro} />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:mt-12 xl:gap-6 lg:grid-cols-3">
        {(b.cards ?? []).map((card) => {
          const from = lowestPrice(prices, selection(card.products));
          return (
            <li key={card.id ?? card.title} className={cn("flex flex-col gap-3 rounded-lg border border-border p-6 transition-shadow duration-fast hover:shadow-elevation-2 xl:p-8", b.tone === "plain" ? "bg-surface-1" : "bg-surface-0")}>
              <BlockIcon name={card.icon} className="size-6 text-link" />
              <h3 className="text-headline text-ink">{card.title}</h3>
              <div className="flex flex-1 flex-col gap-2 text-callout text-ink-muted">
                {card.body ? <p>{card.dataCentre ? withDataCentre(card.body, ctx.market) : card.body}</p> : null}
                {card.note ? <p>{card.note}</p> : null}
              </div>
              <p className="text-callout text-ink">
                {from ? (
                  <>
                    From <span className="font-semibold tabular-nums">{formatMoney(from.price, ctx.market.locale)}</span> {from.unitLabel} a month
                  </>
                ) : (
                  "Priced for you. Talk to us."
                )}
              </p>
            </li>
          );
        })}
      </ul>
      {b.more?.label ? (
        <p className="mt-8">
          <CmsTextLink link={b.more} market={ctx.market} />
        </p>
      ) : null}
    </Section>
  );
}

async function Pricing({ block: b, ctx }: { block: PricingBlock; ctx: BlockContext }) {
  const [prices, market] = await Promise.all([sitePrices(ctx.market.code), siteMarket(ctx.market.code)]);
  const rows = selected(prices, selection(b.products));
  const tax = taxNote(market);
  return (
    <Section tone={b.tone} labelledBy={`${ctx.id}-title`}>
      <Heading id={`${ctx.id}-title`} tone={b.tone} kicker={b.kicker} heading={b.heading} intro={[b.intro, tax].filter(Boolean).join(" ")} />
      {rows.length ? (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:mt-12 xl:gap-6 lg:grid-cols-3">
          {rows.map((p) => (
            <li key={p.slug} className={cn("flex flex-col gap-2 rounded-lg border border-border p-6", cardSurface(b.tone))}>
              <h3 className="text-headline text-ink">{p.name}</h3>
              <p className="flex-1 text-callout text-ink-muted">{p.summary}</p>
              <p className="text-callout text-ink">
                <span className="text-title-2 font-semibold tabular-nums">{formatMoney(p.price, ctx.market.locale)}</span> {p.unitLabel} a month
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className={cn("mt-6 text-body", b.tone === "dark" ? "" : "text-ink-muted")}>These services are priced for you. Talk to us.</p>
      )}
      {b.more?.label ? (
        <p className="mt-8">
          <CmsTextLink link={b.more} market={ctx.market} />
        </p>
      ) : null}
    </Section>
  );
}

function TextSection({ block: b, ctx }: { block: TextBlock; ctx: BlockContext }) {
  return (
    <Section tone={b.tone} labelledBy={`${ctx.id}-title`}>
      {b.heading ? <Heading id={`${ctx.id}-title`} tone={b.tone} heading={b.heading} /> : <span id={`${ctx.id}-title`} className="sr-only">Text</span>}
      <div className={b.heading ? "mt-6" : undefined}>
        <SiteRichText data={b.body} market={ctx.market} style={b.tone === "dark" ? "block-dark" : "block"} />
      </div>
    </Section>
  );
}

function Figure({ picture, market, className }: { picture: PictureValue; market: HomeMarket; className?: string }) {
  const caption = captionFor(picture);
  return (
    <figure className={cn("min-w-0", className)}>
      <div className="overflow-hidden rounded-lg border border-border bg-surface-0 shadow-elevation-3">
        <PictureBody picture={picture} market={market} />
      </div>
      {caption ? <figcaption className={picture.source === "thebe-approvals" && !picture.caption ? "sr-only" : "mt-3 text-caption text-ink-muted"}>{caption}</figcaption> : null}
    </figure>
  );
}

function ImageText({ block: b, ctx }: { block: ImageTextBlock; ctx: BlockContext }) {
  const picture = b.picture as PictureValue | undefined;
  const card = b.card?.title ? b.card : null;
  const dark = b.tone === "dark";
  const text = (
    <div className={cn("flex min-w-0 flex-col", card ? "gap-4" : "gap-10")}>
      <Heading id={`${ctx.id}-title`} tone={b.tone} kicker={b.kicker} heading={b.heading} intro={b.intro} />
      {b.points?.length ? (
        <ul className="flex flex-col gap-6">
          {b.points.map((p) => (
            <li key={p.id ?? p.title} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-soft text-link">
                <BlockIcon name={p.icon} className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className={cn("text-headline", dark ? "text-on-navy" : "text-ink")}>{p.title}</h3>
                {p.body ? <p className={cn("text-callout", dark ? "" : "text-ink-muted")}>{p.body}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
  const side = hasPicture(picture) ? (
    card ? (
      <article aria-labelledby={`${ctx.id}-card`} className="overflow-hidden rounded-lg border border-on-navy/10 bg-surface-1 text-ink shadow-elevation-3">
        <figure className="border-b border-border">
          <PictureBody picture={picture} market={ctx.market} />
          {captionFor(picture) ? <figcaption className={picture.caption ? "px-6 pt-3 text-caption text-ink-muted" : "sr-only"}>{captionFor(picture)}</figcaption> : null}
        </figure>
        <div className="flex flex-col gap-2 p-6">
          {card.kicker ? <p className="label-kicker text-link">{card.kicker}</p> : null}
          <h3 id={`${ctx.id}-card`} className="text-title-2 text-ink">
            {card.title}
          </h3>
          {card.body ? <p className="text-callout text-ink-muted">{card.body}</p> : null}
          <CmsTextLink link={card.link} market={ctx.market} className="mt-2 w-fit" />
        </div>
      </article>
    ) : (
      <Figure picture={picture} market={ctx.market} />
    )
  ) : null;
  return (
    <Section tone={b.tone} labelledBy={`${ctx.id}-title`}>
      <div className={cn("grid items-center lg:grid-cols-2", card ? "gap-10" : "gap-12")}>
        {b.pictureSide === "left" ? (
          <>
            {side}
            {text}
          </>
        ) : (
          <>
            {text}
            {side}
          </>
        )}
      </div>
    </Section>
  );
}

function Faq({ block: b, ctx }: { block: FaqBlock; ctx: BlockContext }) {
  return (
    <Section tone={b.tone} labelledBy={`${ctx.id}-title`}>
      <Heading id={`${ctx.id}-title`} tone={b.tone} kicker={b.kicker} heading={b.heading} intro={b.intro} />
      <div className="mt-10 flex max-w-3xl flex-col divide-y divide-border rounded-lg border border-border">
        {(b.items ?? []).map((q) => (
          <details key={q.id ?? q.question} className={cn("group p-5", cardSurface(b.tone))}>
            <summary className="cursor-pointer text-headline text-ink">{q.question}</summary>
            <div className="mt-3">
              <SiteRichText data={q.answer} market={ctx.market} style="block" />
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}

function Testimonials({ block: b, ctx }: { block: TestimonialsBlock; ctx: BlockContext }) {
  if (!b.items?.length) return null;
  return (
    <Section tone={b.tone} labelledBy={`${ctx.id}-title`}>
      <h2 id={`${ctx.id}-title`} className={b.heading ? cn("mb-10 text-title-1 sm:text-display", b.tone === "dark" ? "text-on-navy" : "text-ink") : "sr-only"}>
        {b.heading || "What customers say"}
      </h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {b.items.map((t) => (
          <li key={t.id ?? t.name} className={cn("rounded-lg border border-border p-6", cardSurface(b.tone))}>
            <blockquote className="text-body text-ink">{t.quote}</blockquote>
            <p className="mt-3 text-callout text-ink-muted">
              {t.name}
              {t.role ? `, ${t.role}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function LogoStrip({ block: b, ctx }: { block: LogoStripBlock; ctx: BlockContext }) {
  return (
    <Section tone={b.tone} labelledBy={`${ctx.id}-title`}>
      <h2 id={`${ctx.id}-title`} className={b.heading ? cn("text-headline", b.tone === "dark" ? "text-on-navy" : "text-ink-muted") : "sr-only"}>
        {b.heading || "Organisations we work with"}
      </h2>
      <ul className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-6">
        {(b.logos ?? []).map((l) => (
          <li key={l.id ?? l.name} className="h-10 w-32">
            <MediaImage media={l.image} sizes="128px" className="h-10 w-auto object-contain" />
            <span className="sr-only">{l.name}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CallToAction({ block: b, ctx }: { block: CallToActionBlock; ctx: BlockContext }) {
  const dark = b.tone === "dark";
  return (
    <section aria-labelledby={`${ctx.id}-title`} className={dark ? "bg-navy text-ink-on-dark" : b.tone === "light" ? "border-t border-border bg-surface-1" : undefined}>
      <div className="page-container flex flex-col items-start gap-6 py-16 lg:py-20">
        <h2 id={`${ctx.id}-title`} className={cn("max-w-3xl text-title-1 sm:text-display", dark ? "text-on-navy" : "text-ink")}>
          {b.heading}
        </h2>
        {b.body ? <p className={cn("max-w-2xl text-body", dark ? "" : "text-ink-muted")}>{b.body}</p> : null}
        {b.primary?.label || b.secondary?.label ? (
          <div className="flex flex-wrap gap-3">
            <CmsButton link={b.primary} market={ctx.market} />
            <CmsButton link={b.secondary} market={ctx.market} variant="secondary" />
          </div>
        ) : null}
      </div>
    </section>
  );
}

type AnyBlock = NonNullable<Page["layout"]>[number];

/** Every piece of text with the market's details filled in (see rich-text.tsx). */
function fillDeep<T>(value: T, m: TextMarket): T {
  if (typeof value === "string") return fill(value, m) as T;
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, m)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "url" || k === "filename" ? v : fillDeep(v, m)])) as T;
  return value;
}

export type SiteMarket = HomeMarket & { dataProtectionLaw: string | null; taxEnabled?: boolean };

async function PageIntro({ block: b, ctx }: { block: PageIntroBlock; ctx: BlockContext }) {
  const tax = b.showTaxNote ? taxNote(await siteMarket(ctx.market.code)) : null;
  const intro = [b.intro, tax].filter(Boolean).join(" ");
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {b.kicker ? <p className="label-kicker text-link">{b.kicker}</p> : null}
      <h1 className="text-title-1 text-ink sm:text-display">{b.heading}</h1>
      {intro ? <p className="text-body text-ink-muted">{intro}</p> : null}
    </div>
  );
}

function assistantCountry(market: HomeMarket) {
  return market.code === CATCH_ALL ? "your country" : market.name;
}

function Block({ block, ctx }: { block: AnyBlock; ctx: BlockContext }) {
  switch (block.blockType) {
    case "pageIntro":
      return (
        <div className="page-container pt-12 lg:pt-16">
          <PageIntro block={block} ctx={ctx} />
        </div>
      );
    case "hero":
      return <Hero block={block} ctx={ctx} />;
    case "domainSearch":
      return <DomainSearchSection block={block} ctx={ctx} />;
    case "featureCards":
      return <FeatureCards block={block} ctx={ctx} />;
    case "servicesGrid":
      return <ServicesGrid block={block} ctx={ctx} />;
    case "pricing":
      return <Pricing block={block} ctx={ctx} />;
    case "text":
      return <TextSection block={block} ctx={ctx} />;
    case "imageText":
      return <ImageText block={block} ctx={ctx} />;
    case "faq":
      return <Faq block={block} ctx={ctx} />;
    case "testimonials":
      return <Testimonials block={block} ctx={ctx} />;
    case "logoStrip":
      return <LogoStrip block={block} ctx={ctx} />;
    case "callToAction":
      return <CallToAction block={block} ctx={ctx} />;
    case "assistantNotice":
      return (
        <Section tone="plain" labelledBy={`${ctx.id}-title`}>
          <div className="flex max-w-3xl flex-col gap-3 text-body text-ink-body">
            <h2 id={`${ctx.id}-title`} className="text-title-2 text-ink">
              {block.heading}
            </h2>
            <AssistantNoticeText countryName={assistantCountry(ctx.market)} />
          </div>
        </Section>
      );
    default:
      return null;
  }
}

/** A document page's sections: one column of headings and text, as the Security page has always looked. */
function DocumentBlock({ block, ctx }: { block: AnyBlock; ctx: BlockContext }) {
  switch (block.blockType) {
    case "pageIntro":
      return (
        <PageIntroHeader kicker={block.kicker ?? ""} title={block.heading}>
          {block.intro}
        </PageIntroHeader>
      );
    case "text":
      return block.heading ? (
        <ProseSection id={`${ctx.id}-title`} title={block.heading}>
          <SiteRichText data={block.body} market={ctx.market} style="prose" />
        </ProseSection>
      ) : (
        <SiteRichText data={block.body} market={ctx.market} style="prose" />
      );
    case "assistantNotice":
      return (
        <ProseSection id={`${ctx.id}-title`} title={block.heading}>
          <AssistantNoticeText countryName={assistantCountry(ctx.market)} />
        </ProseSection>
      );
    default:
      return <Block block={block} ctx={ctx} />;
  }
}

export function RenderBlocks({ blocks, market, style }: { blocks: Page["layout"]; market: SiteMarket; style?: Page["style"] }) {
  const filled = fillDeep(blocks ?? [], market);
  if (style === "document") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6 lg:py-16">
        {filled.map((block, i) => (
          <DocumentBlock key={block.id ?? i} block={block} ctx={{ market, id: `s${i + 1}` }} />
        ))}
      </div>
    );
  }
  return (
    <>
      {filled.map((block, i) => (
        <Block key={block.id ?? i} block={block} ctx={{ market, id: `s${i + 1}` }} />
      ))}
    </>
  );
}

/** The heading block of a page, for pages that draw it themselves (the pricing page, above its tables). */
export function PageHeading({ block, market }: { block: PageIntroBlock; market: SiteMarket }) {
  return <PageIntro block={fillDeep(block, market)} ctx={{ market, id: "intro" }} />;
}
