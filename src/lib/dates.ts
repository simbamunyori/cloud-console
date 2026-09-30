/**
 * Ledger dates are calendar days with no time. They are stored as DATE
 * and handled here as midnight UTC, so a date never shifts across a
 * time-zone boundary.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date where the organisation is. */
export function todayIn(timeZone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parseDateOnly(parts)!;
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Same day of the month `months` later, or the month's last day when it is shorter (31 Jan + 1 = 28 Feb). */
export function addMonths(d: Date, months: number): Date {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = endOfMonth(target).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), last)));
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

// Fixed names: ICU versions disagree on "Sep" versus "Sept".
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "24 Sep" or "24 Sep 2026". */
export function formatDay(d: Date, withYear = false): string {
  const base = `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
}

/** "September 2026". */
export function formatMonth(d: Date): string {
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "1 – 24 Sep 2026", "28 Aug – 24 Sep 2026". */
export function formatRange(from: Date, to: Date): string {
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const sameMonth = sameYear && from.getUTCMonth() === to.getUTCMonth();
  const end = formatDay(to, true);
  if (sameMonth) return `${from.getUTCDate()} – ${end}`;
  return `${formatDay(from, !sameYear)} – ${end}`;
}

/** "Thursday 24 September 2026". */
export function formatLongDate(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "24 Sep 2026 at 16:40" in the given time zone. */
export function formatMoment(d: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${Number(parts.day)} ${MONTHS_SHORT[Number(parts.month) - 1]} ${parts.year} at ${parts.hour}:${parts.minute}`;
}

/** The hour of the day (0–23) where the organisation is. */
export function hourIn(timeZone: string, now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** The Monday on or before a date. Weeks run Monday to Sunday. */
export function mondayOf(d: Date): Date {
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

/** "Mon 21 Sep". */
export function formatShortWeekday(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${formatDay(d)}`;
}

/** The instant a wall-clock time falls on in a time zone: "2026-10-09" at "17:00" in Africa/Gaborone. Null when either is malformed. */
export function zonedTime(dateOnly: string, hhmm: string, timeZone: string): Date | null {
  const day = parseDateOnly(dateOnly);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!day || !m) return null;
  const wall = day.getTime() + (Number(m[1]) * 60 + Number(m[2])) * 60_000;
  const offset = (at: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" })
        .formatToParts(new Date(at))
        .map((x) => [x.type, Number(x.value)]),
    );
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(at / 60_000) * 60_000;
  };
  // Twice, so a guess on the wrong side of a clock change settles.
  let at = wall - offset(wall);
  at = wall - offset(at);
  return new Date(at);
}
