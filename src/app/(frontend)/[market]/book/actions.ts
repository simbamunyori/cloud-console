"use server";

import { field, type ActionState } from "@/server/action-state";
import { requestContext } from "@/server/auth/next";
import { countForCampaign, currentTouch } from "@/server/campaigns/cookie";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { DomainError } from "@/server/org/access";
import { bookCall, cancelByVisitor } from "@/server/presales/booking";
import { enforce, LIMITS, RateLimitedError } from "@/server/security/rate-limit";
import { siteMarket } from "@/server/site/site";
import { formatMoment } from "@/lib/dates";

export interface BookingState extends ActionState {
  booked?: { reference: string; when: string; email: string };
}

const FIELDS = ["start", "name", "email", "phone", "company", "notes"] as const;

export async function bookCallAction(_prev: BookingState, form: FormData): Promise<BookingState> {
  const values = Object.fromEntries(FIELDS.map((k) => [k, field(form, k)]));
  // A field people can't see: only bots fill it in.
  if (field(form, "website")) return { booked: { reference: "CALL-RECEIVED", when: "", email: values.email } };
  try {
    const market = await siteMarket(field(form, "market"));
    const ip = (await requestContext()).ipAddress ?? "unknown";
    await enforce(prisma, `bookingPerIp:${ip}`, LIMITS.bookingPerIp);
    const booking = await bookCall(
      prisma,
      market,
      {
        start: values.start,
        topic: field(form, "topic"),
        name: values.name,
        email: values.email,
        phone: values.phone,
        company: values.company,
        notes: values.notes,
        consent: field(form, "consent") === "yes",
      },
      { touch: await currentTouch() },
    );
    await countForCampaign("LEAD", booking.reference);
    await runSoon("email-deliver").catch(() => undefined);
    return { booked: { reference: booking.reference, when: formatMoment(booking.startsAt, market.timeZone), email: booking.email } };
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: "You've booked several calls already. Email us instead.", values };
    if (e instanceof DomainError) return { error: e.fieldErrors ? undefined : e.field ? undefined : e.message, fieldErrors: e.fieldErrors ?? (e.field ? { [e.field]: e.message } : undefined), values };
    throw e;
  }
}

export async function cancelCallAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await cancelByVisitor(prisma, field(form, "token"));
    await runSoon("email-deliver").catch(() => undefined);
    return { ok: true, message: "The call is cancelled. We've emailed you and the engineer, and it comes off both calendars." };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}
