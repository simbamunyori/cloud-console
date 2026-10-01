import type { IdentityProvider } from "@prisma/client";
import { Button } from "@/components/ui/button";

const LOGO: Record<IdentityProvider, { src: string; name: string; slug: string }> = {
  MICROSOFT: { src: "/site/sign-in/microsoft.svg", name: "Microsoft", slug: "microsoft" },
  GOOGLE: { src: "/site/sign-in/google.svg", name: "Google", slug: "google" },
};

/**
 * "Sign in with Microsoft" and "Sign in with Google": links to the start of
 * the round trip, drawn as buttons with each company's own mark. Nothing
 * shows while neither is set up.
 */
export function ProviderButtons({ providers, verb = "Sign in", base = "", next }: { providers: IdentityProvider[]; verb?: string; base?: "" | "/admin"; next?: string }) {
  if (!providers.length) return null;
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => (
        <Button key={p} variant="secondary" size="lg" asChild className="w-full">
          {/* A plain link: the round trip leaves the site, so the router must not prefetch it. */}
          <a href={`${base}/auth/${LOGO[p].slug}/start${query}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO[p].src} alt="" width={20} height={20} className="size-5" />
            {verb} with {LOGO[p].name}
          </a>
        </Button>
      ))}
    </div>
  );
}

/** The rule between the other ways in and the email form. */
export function OrDivider({ children = "or" }: { children?: string }) {
  return (
    <div className="flex items-center gap-3 text-callout text-ink-muted" role="separator">
      <span aria-hidden className="h-px flex-1 bg-border" />
      {children}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
