import { ArrowRight, Bell, CircleCheck, CircleHelp, LifeBuoy, Mail, MessageSquare, Phone, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { cache, Suspense } from "react";
import { attentionItems } from "@/server/billing/views";
import { requireBilling } from "@/server/billing/context";
import { requireMember } from "@/server/org/context";
import { TopMenu } from "./top-menu";

/** Searches services, invoices, domains, tickets and the marketplace (see /app/search). */
export function ConsoleSearch({ id = "console-search", defaultValue }: { id?: string; defaultValue?: string }) {
  return (
    <form action="/app/search" method="get" role="search" className="relative w-full max-w-md">
      <label htmlFor={id} className="sr-only">
        Search your account
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
      <input
        id={id}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search services, invoices, domains"
        autoComplete="off"
        className="h-10 w-full rounded-md border border-border-strong bg-surface-1 pr-3 pl-9 text-callout text-ink placeholder:text-ink-muted"
      />
    </form>
  );
}

/** Looked up once per request, though the bell is drawn in both the phone header and the wide top bar. */
const notifications = cache(async () => {
  try {
    const { billing, today, locale } = await requireBilling();
    const [services, domains, invoices] = await Promise.all([billing.listServices(), billing.listDomains(), billing.listInvoices()]);
    return { items: attentionItems(invoices, services, domains, today, locale), failed: false };
  } catch {
    return { items: [], failed: true };
  }
});

/** What needs the customer, from the same list as Home's "Needs your attention". */
async function Notifications() {
  const { items, failed } = await notifications();
  const urgent = items.filter((i) => i.tone !== "info").length;
  return (
    <TopMenu label="Notifications" icon={<Bell aria-hidden className="size-5" />} badge={urgent}>
      <p className="border-b border-border px-4 py-3 text-headline">Notifications</p>
      {failed ? (
        <p className="px-4 py-4 text-callout text-ink-muted">We can&apos;t check your account right now. Try again in a moment.</p>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-callout text-ink">
          <CircleCheck aria-hidden className="size-5 text-positive" /> Nothing needs you right now.
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-border overflow-y-auto">
          {items.map((i) => (
            <li key={i.key}>
              <Link href={i.href} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-surface-2">
                <span className="text-callout font-semibold text-ink">{i.title}</span>
                <span className="text-caption text-ink-muted">{i.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/app/security#audit-title" className="flex items-center justify-between border-t border-border px-4 py-3 text-callout font-semibold text-link hover:bg-surface-2">
        Activity on your account <ArrowRight aria-hidden className="size-4" />
      </Link>
    </TopMenu>
  );
}

async function Help() {
  const { market } = await requireMember();
  const row = "flex items-center gap-3 px-4 py-3 text-callout hover:bg-surface-2";
  return (
    <TopMenu label="Help" icon={<CircleHelp aria-hidden className="size-5" />}>
      <p className="border-b border-border px-4 py-3 text-headline">Help</p>
      <Link href="/app/support/assistant" className={row}>
        <Sparkles aria-hidden className="size-5 text-link" /> Ask the assistant
      </Link>
      <Link href="/app/support/new" className={row}>
        <MessageSquare aria-hidden className="size-5 text-link" /> Open a ticket
      </Link>
      <Link href="/app/support" className={row}>
        <LifeBuoy aria-hidden className="size-5 text-link" /> Your tickets
      </Link>
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-callout text-ink-muted">
        <a href={`mailto:${market.supportEmail}`} className="flex items-center gap-2 break-all text-link hover:underline">
          <Mail aria-hidden className="size-4 shrink-0" /> {market.supportEmail}
        </a>
        {market.supportPhone ? (
          <a href={`tel:${market.supportPhone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-link hover:underline">
            <Phone aria-hidden className="size-4 shrink-0" /> {market.supportPhone}
          </a>
        ) : null}
        <span>{market.supportHours}</span>
      </div>
    </TopMenu>
  );
}

/** The bell before its count is known: same size, so nothing moves when it arrives. */
function BellPlaceholder() {
  return (
    <span className="flex size-11 items-center justify-center text-ink-muted" aria-hidden>
      <Bell className="size-5" />
    </span>
  );
}

/** Notifications and help, for the top bar on wide screens and the header on phones. */
export function TopActions() {
  return (
    <div className="flex items-center gap-1">
      <Suspense fallback={<BellPlaceholder />}>
        <Notifications />
      </Suspense>
      <Help />
    </div>
  );
}

/** The console's top bar on wide screens: search on the left, notifications and help on the right. */
export function TopBar() {
  return (
    <div className="sticky top-0 z-20 hidden h-16 items-center justify-between gap-6 border-b border-border bg-surface-1 px-8 lg:flex lg:px-12">
      <ConsoleSearch />
      <TopActions />
    </div>
  );
}
