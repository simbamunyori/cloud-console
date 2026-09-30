import { CircleCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * "Find your domain" inside the hero: one wide field and a button, with the
 * market's popular endings under it. Sends the same query as the navy
 * search card, into the console's domain search.
 */
export function HeroDomainSearch({ tlds }: { tlds: string[] }) {
  return (
    <form action="/find-domain" method="get" role="search" aria-labelledby="hero-domain-title" className="flex w-full max-w-2xl flex-col gap-3">
      <h2 id="hero-domain-title" className="text-headline text-ink">
        Find your domain
      </h2>
      <div className="flex flex-col gap-2 rounded-lg border border-border-strong bg-surface-0 p-2 shadow-elevation-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus sm:flex-row sm:items-center">
        <label htmlFor="hero-domain-q" className="sr-only">
          Domain name
        </label>
        <span className="hidden pl-3 text-ink-muted sm:inline-flex">
          <Search aria-hidden className="size-5" />
        </span>
        <input
          id="hero-domain-q"
          name="q"
          placeholder={`yourcompany${tlds[0] ?? ".com"}`}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="h-12 min-w-0 flex-1 bg-transparent px-3 text-headline font-normal text-ink outline-none placeholder:text-ink-muted"
        />
        <Button type="submit" size="lg" className="h-12 px-8">
          Search
        </Button>
      </div>
      {tlds.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-callout text-ink-muted">Popular:</span>
          {tlds.map((tld) => (
            <button key={tld} type="submit" name="tld" value={tld} className="h-9 rounded-full border border-border px-4 text-callout font-semibold text-ink hover:border-border-strong hover:bg-surface-2">
              {tld}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}

/**
 * The top of a site page, full width on every screen: a soft brand glow
 * behind the words, the picture taking seven twelfths on wide screens, and
 * the supporting points as a band of their own under it.
 */
export function SiteHero({
  id,
  kicker,
  heading,
  sub,
  search,
  actions,
  supporting,
  picture,
  caption,
}: {
  id: string;
  kicker?: string | null;
  heading: React.ReactNode;
  sub?: string | null;
  /** The market's popular endings, when the hero carries the domain search. */
  search?: string[] | null;
  actions?: React.ReactNode;
  supporting?: string[];
  picture?: React.ReactNode;
  caption?: string | null;
}) {
  return (
    <section aria-labelledby={id} className="relative overflow-hidden border-b border-border bg-surface-1">
      <div aria-hidden className="pointer-events-none absolute -top-64 -right-40 size-240 rounded-full bg-brand-gradient opacity-10 blur-3xl" />
      <div
        className={cn(
          "page-container relative grid items-center gap-10 pt-12 pb-12 lg:gap-12 lg:pt-20 lg:pb-20 xl:gap-16 xl:pt-24 xl:pb-24",
          picture && "lg:grid-cols-12",
        )}
      >
        <div className={cn("flex min-w-0 flex-col gap-6 xl:gap-8", picture && "lg:col-span-5")}>
          {kicker ? <p className="label-kicker text-link">{kicker}</p> : null}
          <h1 id={id} className="text-display text-ink sm:text-hero 2xl:text-mega">
            {heading}
          </h1>
          {sub ? <p className="max-w-xl text-body text-ink-body sm:text-headline sm:font-normal xl:text-title-2 xl:font-normal">{sub}</p> : null}
          {search ? <HeroDomainSearch tlds={search} /> : null}
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {picture ? (
          <figure className="relative mx-auto w-full max-w-xl min-w-0 lg:col-span-7 lg:max-w-none">
            <div className="overflow-hidden rounded-lg border border-border bg-surface-0 shadow-elevation-3">{picture}</div>
            {caption ? <figcaption className="mt-3 text-caption text-ink-muted">{caption}</figcaption> : null}
          </figure>
        ) : null}
      </div>
      {supporting?.length ? (
        <div className="relative border-t border-border bg-surface-0">
          <ul className={cn("page-container grid gap-4 py-6 sm:grid-cols-2 lg:py-8", supporting.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
            {supporting.map((s) => (
              <li key={s} className="flex items-center gap-3 text-body font-medium text-ink">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive">
                  <CircleCheck aria-hidden className="size-5" />
                </span>
                {s.replace(/\.$/, "")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
