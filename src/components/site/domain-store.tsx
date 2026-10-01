"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { addToCartAction, removeFromCartAction } from "@/app/(frontend)/[market]/cart/actions";
import { cn } from "@/lib/cn";
import type { StoreResult } from "@/server/site/domain-store";

/**
 * The home page's domain search, working like a store: every ending the
 * market sells, available or taken, the price per year from the price
 * book, an alternative for a taken name, and Add to cart. The cart
 * follows the visitor into sign-up and the console.
 */
export function DomainStore({ market, example, initialQuery, initialCart }: { market: string; example: string; initialQuery: string; initialCart: string[] }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<StoreResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState(initialCart);
  const [, startCart] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  async function search(q: string) {
    if (!q.trim()) {
      setError("Type a name, like yourcompany.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch("/api/site/domains", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ market, q }) });
      const body = (await res.json()) as { results?: StoreResult[]; error?: string };
      if (!res.ok || !body.results) throw new Error(body.error ?? "Search isn't working right now.");
      setResults(body.results);
      if (!body.results.length) setError("We don't sell that ending here yet. Try the name on its own.");
    } catch (e) {
      setResults(null);
      setError(e instanceof Error ? e.message : "Search isn't working right now.");
    } finally {
      setSearching(false);
    }
  }

  // Arriving from the menu's search box (?domain=…): search straight away and bring the results into view.
  useEffect(() => {
    if (started.current || !initialQuery) return;
    started.current = true;
    root.current?.scrollIntoView({ block: "start" });
    void search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (name: string) =>
    startCart(async () => {
      setCart(cart.includes(name) ? await removeFromCartAction(name) : await addToCartAction(name));
    });

  const showAlternative = (name: string) => {
    setFlash(name);
    document.getElementById(`domain-${name}`)?.focus();
  };

  return (
    <div ref={root} className="flex scroll-mt-24 flex-col gap-6 lg:gap-8">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
        className="flex gap-1.5 rounded-lg border border-site-frame bg-surface-1 p-1.5 lg:gap-2 lg:p-2"
      >
        <label htmlFor="store-domain" className="sr-only">
          Domain name
        </label>
        <input
          id="store-domain"
          name="domain"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={example}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-2.5 text-body text-ink placeholder:text-ink-muted focus-visible:outline-offset-4 lg:px-4.5 lg:text-title-2 lg:font-normal"
        />
        <button type="submit" disabled={searching} className="inline-flex h-12 items-center rounded-lg bg-brand px-4.5 text-body font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-70 lg:h-15 lg:rounded-sm lg:px-8.5 lg:text-headline">
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-4">
        {error ? <p className="text-body text-ink">{error}</p> : null}
        {results?.length ? (
          <ul aria-label="Search results" className="rounded-lg border border-border bg-surface-1">
            {results.map((r) => {
              const inCart = cart.includes(r.name);
              const available = r.state === "available";
              return (
                <li
                  key={r.name}
                  id={`domain-${r.name}`}
                  tabIndex={-1}
                  className={cn(
                    "flex items-center justify-between gap-4 border-b border-border px-4 py-3.5 last:border-b-0 lg:grid lg:grid-cols-[2fr_1fr_1fr_var(--layout-action-column)] lg:px-6 lg:py-4.5",
                    flash === r.name && "bg-brand-soft",
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-0.5 lg:contents">
                    <span className="text-body font-semibold break-all text-ink lg:text-headline">{r.name}</span>
                    <span className={cn("text-callout lg:text-body lg:font-medium", available ? "text-positive" : "text-quiet")}>
                      {available ? "Available" : "Taken"}
                      <span className="lg:hidden"> · {available ? `${r.price} a year` : r.alternative ? `try ${r.alternative.slice(r.alternative.indexOf("."))} instead` : "try another name"}</span>
                    </span>
                    <span className="hidden text-body text-ink-muted lg:inline">{available ? `${r.price} a year` : r.alternative ? `Try ${r.alternative}` : "Try another name"}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    {available ? (
                      <button
                        type="button"
                        onClick={() => toggle(r.name)}
                        aria-pressed={inCart}
                        aria-label={inCart ? `Remove ${r.name} from your cart` : `Add ${r.name} to your cart`}
                        className={cn(
                          "inline-flex h-10 items-center gap-1.5 rounded-lg border px-4.5 text-callout font-semibold",
                          inCart ? "border-positive text-positive" : "border-brand text-link hover:bg-brand-soft",
                        )}
                      >
                        {inCart ? (
                          <>
                            <Check aria-hidden className="size-4" /> In cart
                          </>
                        ) : (
                          "Add to cart"
                        )}
                      </button>
                    ) : r.alternative ? (
                      <button type="button" onClick={() => showAlternative(r.alternative!)} className="inline-flex h-10 items-center rounded-lg border border-site-frame px-4.5 text-callout font-semibold text-ink hover:bg-surface-2">
                        See options
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {cart.length ? (
          <p className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3.5 text-body lg:px-6">
            <span className="text-ink">
              {cart.length === 1 ? "1 domain" : `${cart.length} domains`} in your cart
            </span>
            <Link href={`/${market}/cart`} className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
              View cart <ArrowRight aria-hidden className="size-4" />
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
