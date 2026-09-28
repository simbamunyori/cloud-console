import { Check } from "lucide-react";
import * as React from "react";
import { Logo, LogoMark } from "@/components/ui/logo";
import { company } from "@/config/app";
import { OUTCOMES, PROMISE } from "@/config/positioning";

export interface AuthShellProps {
  title?: string;
  points?: [string, string][];
  children: React.ReactNode;
}

/**
 * The split screen used by sign-up, sign-in and authenticator setup: a
 * navy brand panel on wide screens, the form on the right. On phones
 * only the form shows, under the mark.
 */
export function AuthShell({ title = PROMISE, points = OUTCOMES, children }: AuthShellProps) {
  return (
    <div className="flex min-h-dvh">
      <aside className="relative hidden w-auth-panel shrink-0 flex-col overflow-hidden bg-navy px-14 py-12 text-ink-on-dark lg:flex">
        <LogoMark size={44} onDark title={company.name} />
        <div className="relative mt-auto flex flex-col gap-8">
          <span aria-hidden className="h-1 w-16 rounded-full bg-brand-gradient" />
          <h2 className="text-display text-balance text-on-navy">{title}</h2>
          <ul className="flex flex-col gap-5">
            {points.map(([head, body]) => (
              <li key={head} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
                  <Check aria-hidden className="size-3.5" strokeWidth={2.25} />
                </span>
                <span className="flex flex-col">
                  <span className="text-headline text-on-navy">{head}</span>
                  <span className="text-callout text-ink-on-dark">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-callout text-ink-on-dark">{company.tagline}</p>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-12">
        <Logo className="mb-10 lg:hidden" />
        <div className="w-full max-w-form">{children}</div>
      </main>
    </div>
  );
}

export function AuthHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow ? <span className="label-kicker text-ink-muted">{eyebrow}</span> : null}
      <h1 className="text-title-1 text-ink">{title}</h1>
      {children ? <p className="text-body text-ink-muted">{children}</p> : null}
    </div>
  );
}
