/**
 * A calendar invite (RFC 5545) for one meeting: METHOD:REQUEST to add or
 * change it, METHOD:CANCEL to take it off both calendars. The same UID
 * and a higher SEQUENCE update the meeting already there.
 */

export interface Invite {
  method: "REQUEST" | "CANCEL";
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location?: string | null;
  organizer: { name: string; email: string };
  attendees: { name: string; email: string }[];
  now?: Date;
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const param = (s: string) => `"${s.replace(/["\r\n]/g, "")}"`;

/** Lines longer than 75 octets are folded, as the standard asks. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function calendarInvite(i: Invite): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fourth Generation Technologies//Cloud Console//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.method}`,
    "BEGIN:VEVENT",
    `UID:${i.uid}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${stamp(i.now ?? new Date())}`,
    `DTSTART:${stamp(i.start)}`,
    `DTEND:${stamp(i.end)}`,
    `SUMMARY:${escape(i.summary)}`,
    `DESCRIPTION:${escape(i.description)}`,
    ...(i.location ? [`LOCATION:${escape(i.location)}`] : []),
    `ORGANIZER;CN=${param(i.organizer.name)}:mailto:${i.organizer.email}`,
    ...i.attendees.map((a) => `ATTENDEE;CN=${param(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${i.method === "CANCEL" ? "DECLINED" : "NEEDS-ACTION"};RSVP=TRUE:mailto:${a.email}`),
    `STATUS:${i.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
