import { ArrowRight, CalendarClock, Calculator, Globe, MailCheck, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { partnerLinks } from "@/server/site/partner-links";
import { siteMarket, siteMetadata } from "@/server/site/site";

type Props = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  return siteMetadata(m.code, "/tools", {
    title: `Free tools for your business | ${company.name}`,
    description: "Check your email security, work out what Microsoft 365 or Google Workspace would cost, and see how ready you are for data protection law. Free, in a minute each.",
  });
}

/** The free tools (final build, Milestone 8), each a minute's work with a useful answer. */
export default async function ToolsPage({ params }: Props) {
  const m = await siteMarket((await params).market);
  const { bookingHref } = await partnerLinks(m.code);
  const law = m.dataProtectionLaw ?? "data protection law";
  const tools = [
    { href: `/${m.code}/tools/email-security`, icon: MailCheck, title: "Email security check", text: "Enter your domain and see whether your email can be faked, with the fix for each gap." },
    {
      href: `/${m.code}/tools/cost-calculator`,
      icon: Calculator,
      title: "Microsoft 365 and Google Workspace calculator",
      text: "Tell us how many people and what they need. Get the right plan and the monthly total.",
    },
    { href: `/${m.code}/tools/data-protection`, icon: ShieldCheck, title: `${law} readiness checklist`, text: "Twelve questions, a score and your next steps, most important first." },
    { href: `/${m.code}#domains`, icon: Globe, title: "Domain search", text: "Search once and see every ending that is free, with the price per year." },
    ...(bookingHref ? [{ href: bookingHref, icon: CalendarClock, title: "Talk to a pre-sales engineer", text: "Book 30 minutes at a time that suits you. We send a calendar invite." }] : []),
  ];
  return (
    <SitePage code={m.code} path="/tools">
      <div className="page-container flex flex-col gap-10 py-12 lg:gap-14 lg:py-16">
        <header className="flex max-w-3xl flex-col gap-4">
          <p className="label-kicker text-link">Free tools</p>
          <h1 className="text-title-1 text-ink sm:text-display xl:text-display-lg">Useful answers in a minute.</h1>
          <p className="text-body text-ink-muted xl:text-headline xl:font-normal">No account needed. Each tool gives you the answer on the page, and you choose whether we email it to you.</p>
        </header>
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="group flex h-full flex-col gap-4 rounded-lg border border-border bg-surface-1 p-6 transition-shadow hover:shadow-elevation-2 xl:p-8">
                <t.icon aria-hidden className="size-8 text-link" />
                <span className="text-title-2 text-ink">{t.title}</span>
                <span className="flex-1 text-body text-ink-muted">{t.text}</span>
                <span className="inline-flex items-center gap-1 text-callout font-semibold text-link group-hover:underline">
                  Start <ArrowRight aria-hidden className="size-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </SitePage>
  );
}
