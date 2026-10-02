import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { formatMoment } from "@/lib/dates";
import { requireStaffCan } from "@/server/admin/context";
import { prisma } from "@/server/db";
import { hoursOf, myAvailability, TOPICS, upcomingBookings } from "@/server/presales/booking";
import { staffCan } from "@/server/staff/access";
import { CancelBookingForm, HoursForm } from "./forms";

export const metadata: Metadata = { title: "Pre-sales calls" };

/** Pre-sales calls (final build, Milestone 8): your weekly hours, and the calls booked. */
export default async function BookingsPage() {
  const { staff } = await requireStaffCan("viewCustomers");
  const [mine, bookings, markets] = await Promise.all([myAvailability(prisma, staff), upcomingBookings(prisma, staff), prisma.market.findMany({ select: { timeZone: true } })]);
  const timeZones = [...new Set([DEFAULT_TIME_ZONE, ...markets.map((m) => m.timeZone)])];
  const now = new Date();
  const everyone = staffCan(staff, "manageStaff");

  return (
    <>
      <PageHeader
        title="Pre-sales calls"
        description="Visitors book 30 minutes with whoever is free, from the booking page linked from Thapelo, product pages and the free tools. Each booking sends a calendar invite to you and to them. The booking links show on the site only while someone has hours set."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_var(--layout-aside-wide)] [&>*]:min-w-0">
        <Card aria-labelledby="calls-title">
          <CardHeader id="calls-title" title={everyone ? "Calls booked" : "Your calls"} description={everyone ? "Everyone's calls from today on." : "Your calls from today on."} />
          {bookings.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No calls booked">
              When a visitor books, the call appears here and in your calendar.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {bookings.map((b) => (
                <li key={b.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold text-ink">
                      {formatMoment(b.startsAt, b.engineer.timeZone)}
                      {everyone ? <span className="font-normal text-ink-muted">, with {b.engineer.user.name}</span> : null}
                    </span>
                    <span className="text-callout text-ink">
                      {b.name}
                      {b.company ? `, ${b.company}` : ""} ·{" "}
                      <a href={`mailto:${b.email}`} className="text-link underline underline-offset-2">
                        {b.email}
                      </a>
                      {b.phone ? ` · ${b.phone}` : ""}
                    </span>
                    <span className="text-caption text-ink-muted">
                      {TOPICS[b.topic] ?? b.topic} · {b.reference} · {b.market.toUpperCase()}
                      {b.lead ? (
                        <>
                          {" · "}
                          <Link href={`/admin/leads/${b.lead.reference}`} className="text-link underline underline-offset-2">
                            Lead {b.lead.reference}
                          </Link>
                        </>
                      ) : null}
                    </span>
                    {b.notes ? <span className="mt-1 text-callout text-ink-muted">{b.notes}</span> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {b.status === "CANCELLED" ? <Badge>Cancelled</Badge> : b.endsAt < now ? <Badge tone="positive">Done</Badge> : <CancelBookingForm reference={b.reference} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card aria-labelledby="hours-title">
          <CardHeader id="hours-title" title="Your hours" description="The times you take calls each week. Visitors see the free half-hours in the next two weeks, from four hours ahead." />
          <CardBody>
            <HoursForm hours={mine ? hoursOf(mine.hours) : []} active={mine?.active ?? true} meetingUrl={mine?.meetingUrl ?? ""} timeZone={mine?.timeZone ?? DEFAULT_TIME_ZONE} timeZones={timeZones} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
