import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/site-page";
import { company } from "@/config/app";
import { formatShortWeekday, parseDateOnly } from "@/lib/dates";
import { prisma } from "@/server/db";
import { BOOKING_CONSENT, freeSlots, topicOf, TOPICS } from "@/server/presales/booking";
import { siteMarket, siteMetadata } from "@/server/site/site";
import { BookingForm } from "./booking-form";

type Props = { params: Promise<{ market: string }>; searchParams: Promise<{ topic?: string; about?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const m = await siteMarket((await params).market);
  return siteMetadata(m.code, "/book", {
    title: `Book a call with a pre-sales engineer | ${company.name}`,
    description: "Pick a time that suits you for 30 minutes with one of our engineers. We'll send a calendar invite to you and to them.",
  });
}

// Free times change with every booking.
export const dynamic = "force-dynamic";

/** Book a pre-sales engineer (final build, Milestone 8). */
export default async function BookPage({ params, searchParams }: Props) {
  const m = await siteMarket((await params).market);
  const q = await searchParams;
  const topic = topicOf(q.topic);
  const about = q.about && /^[\w-]{1,80}$/.test(q.about) ? await prisma.product.findFirst({ where: { slug: q.about, status: "LIVE" }, select: { name: true } }) : null;
  const days = (await freeSlots(prisma, m.timeZone)).map((d) => ({ ...d, label: formatShortWeekday(parseDateOnly(d.day)!) }));
  return (
    <SitePage code={m.code} path="/book">
      <div className="page-container flex flex-col gap-10 py-12 lg:flex-row lg:items-start lg:gap-16 lg:py-16">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex max-w-3xl flex-col gap-4">
            <p className="label-kicker text-link">Talk to an engineer</p>
            <h1 className="text-title-1 text-ink sm:text-display xl:text-display-lg">{topic === "thebe" ? "Book a demo of Thebe." : "Book a call with a pre-sales engineer."}</h1>
            <p className="text-body text-ink-muted xl:text-headline xl:font-normal">
              {topic === "thebe"
                ? "Thirty minutes on screen with one of our engineers: requests, approvals and budgets, with your questions answered."
                : "Thirty minutes with someone who sets these services up every week. Free, with no obligation."}
            </p>
          </header>
          {days.length ? (
            <BookingForm
              market={m.code}
              topic={topic}
              days={days}
              notes={about ? `About ${about.name}.` : topic !== "general" && topic !== "product" ? `About ${TOPICS[topic].toLowerCase()}.` : ""}
              consent={BOOKING_CONSENT}
              privacyHref={`/${m.code}/legal/privacy`}
              timeZone={m.timeZone}
            />
          ) : (
            <p className="max-w-3xl text-body text-ink">
              There are no free times in the next two weeks. Tell us what you need on the{" "}
              <Link href={`/${m.code}/quote`} className="font-semibold text-link hover:underline">
                quote page
              </Link>{" "}
              and we&apos;ll get back to you, or email {m.supportEmail}.
            </p>
          )}
        </div>
        <aside aria-labelledby="expect-title" className="flex h-fit shrink-0 flex-col gap-3 rounded-lg bg-surface-2 p-6 lg:w-96 xl:w-104">
          <h2 id="expect-title" className="text-headline text-ink">
            What to expect
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-callout text-ink-body">
            <li>A calendar invite to you and the engineer as soon as you book.</li>
            <li>A video link, or a phone call if you&apos;d rather.</li>
            <li>A reminder the day before.</li>
            <li>Straight answers on what fits and what it costs. No sales script.</li>
          </ul>
        </aside>
      </div>
    </SitePage>
  );
}
