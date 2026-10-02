import "server-only";
import { cache } from "react";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { bookingOpen } from "@/server/presales/booking";
import { cms } from "./cms";

/** Thebe's and NSMC's websites, used unless the server's settings name another address. */
export const THEBE_SITE = "https://www.thebe.africa";
export const NSMC_SITE = "https://www.nsmc.africa";

export interface PartnerLinks {
  /** "Learn more about Thebe". */
  thebeUrl: string;
  /** "Try Thebe": the site editor's address, then THEBE_TRY_URL, then Thebe's website. */
  thebeTryUrl: string;
  /** "Book a Thebe demo": THEBE_DEMO_URL, or our booking page while it takes bookings. */
  thebeDemoUrl: string | null;
  nsmcUrl: string;
  /** The pre-sales booking page, while anyone takes bookings. */
  bookingHref: string | null;
}

/** Whether the booking page takes bookings: links to it hide otherwise. Once per request. */
export const bookingIsOpen = cache(() => bookingOpen(prisma));

export const partnerLinks = cache(async (code: string): Promise<PartnerLinks> => {
  const e = env();
  const [editor, open] = await Promise.all([
    cms()
      .then((p) => p.findGlobal({ slug: "partner-links", depth: 0, overrideAccess: true }))
      .catch(() => null),
    bookingIsOpen(),
  ]);
  const booking = open ? `/${code}/book` : null;
  return {
    thebeUrl: e.THEBE_URL ?? THEBE_SITE,
    thebeTryUrl: editor?.thebeTryUrl?.trim() || e.THEBE_TRY_URL || THEBE_SITE,
    thebeDemoUrl: e.THEBE_DEMO_URL ?? (booking ? `${booking}?topic=thebe` : null),
    nsmcUrl: e.NSMC_URL ?? NSMC_SITE,
    bookingHref: booking,
  };
});
