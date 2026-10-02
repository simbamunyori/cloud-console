import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/components/site/site-page";
import { formatMoment } from "@/lib/dates";
import { prisma } from "@/server/db";
import { bookingByToken, TOPICS } from "@/server/presales/booking";
import { siteMarket } from "@/server/site/site";
import { CancelForm } from "./cancel-form";

export const metadata: Metadata = { title: "Cancel your call", robots: { index: false, follow: false } };

type Props = { params: Promise<{ market: string; token: string }> };

export default async function CancelCallPage({ params }: Props) {
  const { market, token } = await params;
  const m = await siteMarket(market);
  const booking = await bookingByToken(prisma, token);
  const live = booking && booking.status === "BOOKED" && booking.startsAt > new Date();
  return (
    <SitePage code={m.code} path="/book">
      <div className="page-container flex max-w-3xl flex-col gap-6 py-12 lg:py-16">
        <h1 className="text-title-1 text-ink sm:text-display">Cancel your call</h1>
        {live ? (
          <>
            <p className="text-body text-ink">
              {TOPICS[booking.topic] ?? "Your call"}, {formatMoment(booking.startsAt, m.timeZone)}. Reference {booking.reference}.
            </p>
            <CancelForm token={token} again={`/${m.code}/book?topic=${booking.topic}`} />
          </>
        ) : (
          <p className="text-body text-ink">
            {booking?.status === "CANCELLED" ? "This call is already cancelled." : "This link no longer works: the call has passed, or a newer email has the link."}{" "}
            <Link href={`/${m.code}/book`} className="font-semibold text-link hover:underline">
              Book a new time
            </Link>
            .
          </p>
        )}
      </div>
    </SitePage>
  );
}
