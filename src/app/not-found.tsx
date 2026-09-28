import { Compass } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Logo } from "@/components/ui/logo";

/** Any address we don't have, and a market asked for by name while it is switched off. */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-content flex-col items-center justify-center gap-10 px-4 py-12">
      <Link href="/" className="rounded-sm" aria-label="Home">
        <Logo />
      </Link>
      <div className="w-full max-w-2xl">
        <EmptyState
          icon={Compass}
          title="We can't find that page"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/">Go to the home page</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          }
        >
          The link may be old, or the page may have moved. If you typed the address, check it and try again.
        </EmptyState>
      </div>
    </main>
  );
}
