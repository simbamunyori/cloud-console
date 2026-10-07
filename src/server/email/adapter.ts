import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/server/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe on the newsletter. */
  headers?: Record<string, string>;
  /** A calendar invite (text/calendar), e.g. for a booked call. */
  calendar?: { method: "REQUEST" | "CANCEL"; content: string };
  /** Files sent with the email, e.g. an invoice PDF. */
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** Anything that can deliver an email: SMTP now, an email API later. */
export interface EmailAdapter {
  send(message: EmailMessage): Promise<void>;
}

/** Production mail server, or Mailpit from docker-compose.yml in development. */
export class SmtpEmailAdapter implements EmailAdapter {
  private transporter: Transporter;
  constructor(url: string, private from: string) {
    this.transporter = nodemailer.createTransport(url);
  }
  async send(message: EmailMessage) {
    const { calendar, attachments, ...rest } = message;
    await this.transporter.sendMail({
      from: this.from,
      ...rest,
      ...(calendar ? { icalEvent: { method: calendar.method, filename: "invite.ics", content: calendar.content } } : {}),
      ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })) } : {}),
    });
  }
}

/**
 * Development without a mail server: prints the email so links can be
 * followed. Never used in production, where a missing SMTP_URL is an error.
 */
export class LogEmailAdapter implements EmailAdapter {
  async send(message: EmailMessage) {
    console.info(`\n── Email (not sent: SMTP_URL is not set) ──\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
  }
}

/** Keeps messages in memory, for tests. */
export class MemoryEmailAdapter implements EmailAdapter {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}

let adapter: EmailAdapter | undefined;

export function emailAdapter(): EmailAdapter {
  if (!adapter) {
    const e = env();
    if (e.SMTP_URL) adapter = new SmtpEmailAdapter(e.SMTP_URL, e.MAIL_FROM);
    else if (e.NODE_ENV === "production") throw new Error("SMTP_URL is not set. The console can't send email without it.");
    else adapter = new LogEmailAdapter();
  }
  return adapter;
}
