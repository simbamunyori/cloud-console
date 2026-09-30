import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/site-page";
import { Button } from "@/components/ui/button";
import { currentSession } from "@/server/auth/next";
import { readCart } from "@/server/site/cart";
import { cartLines } from "@/server/site/domain-store";
import { siteMarket, taxNote } from "@/server/site/site";
import { RemoveButton } from "./remove-button";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The domains a visitor picked, checked again now, and the way on: sign up, or straight to the console. */
export default async function CartPage({ params }: { params: Promise<{ market: string }> }) {
  const m = await siteMarket((await params).market);
  const [names, session] = await Promise.all([readCart(), currentSession()]);
  const lines = await cartLines(m, names);
  const signedIn = session?.stage === "ACTIVE";
  const tax = taxNote(m);
  return (
    <SitePage code={m.code} path="/cart">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6 lg:py-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-title-1 text-ink sm:text-display">Your cart</h1>
          <p className="text-body text-ink-muted">
            {lines.length ? `Prices are per year${tax ? `. ${tax}` : "."} You choose how many years when you register.` : "Your cart is empty. Search for a name to add one."}
          </p>
        </header>
        {lines.length ? (
          <>
            <ul className="rounded-lg border border-border bg-surface-1">
              {lines.map((l) => (
                <li key={l.name} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 last:border-b-0">
                  <span className="flex flex-col">
                    <span className="text-headline break-all text-ink">{l.name}</span>
                    <span className={l.state === "available" ? "text-callout text-ink-muted" : "text-callout text-negative"}>
                      {l.state === "available" ? `${l.price} a year` : l.state === "taken" ? "Taken since you added it" : "We can't check this name right now"}
                    </span>
                  </span>
                  <RemoveButton name={l.name} />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href={signedIn ? "/app/cart" : "/sign-up"}>{signedIn ? "Register in the console" : "Create your account"}</Link>
              </Button>
              {signedIn ? null : (
                <Link href="/sign-in?next=%2Fapp%2Fcart" className="text-body font-semibold text-link hover:underline">
                  I already have an account
                </Link>
              )}
            </div>
            {signedIn ? null : <p className="text-callout text-ink-muted">Your cart is kept on this device. After you sign up, the console shows it on your Home page so you can register each name.</p>}
          </>
        ) : (
          <Button asChild size="lg" className="w-fit">
            <Link href={`/${m.code}#domains`}>Search for a domain</Link>
          </Button>
        )}
      </div>
    </SitePage>
  );
}
