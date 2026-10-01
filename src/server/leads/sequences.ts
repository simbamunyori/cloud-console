import type { LeadSource } from "@prisma/client";
import type { EmailBody } from "@/server/email/layout";

/**
 * The follow-up emails for each lead source (final build, Milestone 8):
 * short and useful, the first one carrying what the tool found. They stop
 * when the person orders anything or unsubscribes. Someone who booked a
 * call hears from the engineer instead.
 */

export interface Step {
  /** Days after the lead came in. 0 goes at once. */
  afterDays: number;
}

export const SEQUENCES: Partial<Record<LeadSource, Step[]>> = {
  EMAIL_CHECK: [{ afterDays: 0 }, { afterDays: 3 }, { afterDays: 10 }],
  COST_CALCULATOR: [{ afterDays: 0 }, { afterDays: 3 }, { afterDays: 10 }],
  DPA_CHECKLIST: [{ afterDays: 0 }, { afterDays: 4 }, { afterDays: 12 }],
  ASSISTANT: [{ afterDays: 4 }],
  PERSON: [{ afterDays: 4 }],
  QUOTE: [{ afterDays: 5 }],
  NEWSLETTER: [{ afterDays: 2 }],
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  ASSISTANT: "Thapelo, asked us to get back to them",
  PERSON: "Thapelo, asked for a person",
  QUOTE: "Quote request",
  NEWSLETTER: "Newsletter sign-up",
  EMAIL_CHECK: "Email security check",
  COST_CALCULATOR: "Cost calculator",
  DPA_CHECKLIST: "Data protection checklist",
  BOOKING: "Booked a call",
};

/** In a badge. */
export const SHORT_SOURCE: Record<LeadSource, string> = {
  ASSISTANT: "Thapelo",
  PERSON: "Asked for a person",
  QUOTE: "Quote",
  NEWSLETTER: "Newsletter",
  EMAIL_CHECK: "Email check",
  COST_CALCULATOR: "Calculator",
  DPA_CHECKLIST: "Data protection",
  BOOKING: "Booked a call",
};

/** What the tools keep on the lead for these emails. */
export interface EmailCheckResult {
  domain: string;
  score: number;
  checks: { key: string; status: string; title: string; finding: string; fix: string }[];
}
export interface CalculatorResult {
  provider: string;
  users: number;
  plan: { slug: string; name: string; unit: string; total: string };
  alternative?: { slug: string; name: string; unit: string; total: string } | null;
}
export interface ReadinessResult {
  token: string;
  score: number;
  law: string;
  steps: string[];
}

export interface SequenceContext {
  appUrl: string;
  market: string;
  name: string;
  /** What they asked about, in their words. */
  need: string;
  result: unknown;
  /** The booking page, while pre-sales engineers have hours set. */
  bookingUrl: string | null;
}

type Email = { subject: string; body: EmailBody };

const firstName = (name: string) => (name.includes("@") ? "" : name.split(/\s+/)[0]);
const hello = (name: string) => (firstName(name) ? `Hello ${firstName(name)},` : "Hello,");

function callOrQuote(c: SequenceContext, topic: string): EmailBody["button"] {
  return c.bookingUrl ? { label: "Book a call", url: `${c.bookingUrl}?topic=${topic}` } : { label: "Ask for a quote", url: `${c.appUrl}/${c.market}/quote` };
}

/** The email for one step, or null when the lead no longer has what it needs. */
export function sequenceEmail(source: LeadSource, step: number, c: SequenceContext): Email | null {
  const tools = `${c.appUrl}/${c.market}/tools`;
  switch (source) {
    case "EMAIL_CHECK": {
      const r = c.result as EmailCheckResult | null;
      if (!r?.domain) return null;
      const again = `${tools}/email-security?domain=${encodeURIComponent(r.domain)}`;
      const open = r.checks.filter((x) => x.status === "fail" || x.status === "warn");
      if (step === 0) {
        return {
          subject: `Your email security report for ${r.domain}`,
          body: {
            heading: `${r.domain} scored ${r.score} out of 100`,
            paragraphs: [
              hello(c.name),
              open.length
                ? `Here is what we found, and how to fix the ${open.length === 1 ? "one thing" : `${open.length} things`} that need attention.`
                : "Everything we check is in order. Here is the detail.",
              ...r.checks.map((x) => `${x.title}: ${x.finding}${x.fix ? ` What to do: ${x.fix}` : ""}`),
            ],
            button: { label: "See the report", url: again },
            footnote: "We read public records only: DNS, the website's certificate and the domain's registration.",
          },
        };
      }
      if (step === 1) {
        const worst = open.find((x) => x.status === "fail") ?? open[0];
        return worst
          ? {
              subject: `The one fix that matters most for ${r.domain}`,
              body: {
                heading: `Start with ${worst.title}`,
                paragraphs: [
                  hello(c.name),
                  `When we checked ${r.domain}, this stood out: ${worst.finding}`,
                  `The fix: ${worst.fix}`,
                  "It takes a few minutes in your DNS settings. Check again afterwards to see it working.",
                ],
                button: { label: "Check again", url: again },
              },
            }
          : {
              subject: `Keeping ${r.domain} safe as things change`,
              body: {
                heading: "Check again when anything changes",
                paragraphs: [
                  hello(c.name),
                  "Your records were in order when we checked. They drift when you add a newsletter tool, a new website host or a new email provider, so run the check again after any change like that.",
                ],
                button: { label: "Check again", url: again },
              },
            };
      }
      return {
        subject: "Want us to look after it for you?",
        body: {
          heading: "We can set this up and keep it right",
          paragraphs: [
            hello(c.name),
            "When we run your Microsoft 365 or Google Workspace, SPF, DKIM and DMARC are set up for you and watched afterwards. If you'd rather keep your current provider, we can still look after the records.",
            c.bookingUrl ? "Book 30 minutes with one of our engineers and we'll go through your report with you." : "Tell us what you use today and we'll send you a quote.",
          ],
          button: callOrQuote(c, "email-check"),
        },
      };
    }
    case "COST_CALCULATOR": {
      const r = c.result as CalculatorResult | null;
      if (!r?.plan) return null;
      const order = `${c.appUrl}/sign-up?next=${encodeURIComponent(`/app/marketplace/${r.plan.slug}?quantity=${r.users}`)}`;
      if (step === 0) {
        return {
          subject: `Your estimate: ${r.plan.name}, ${r.plan.total} a month`,
          body: {
            heading: `${r.plan.name} for ${r.users} ${r.users === 1 ? "person" : "people"}`,
            paragraphs: [
              hello(c.name),
              "Here is the estimate you worked out on our website, at this month's prices.",
              ...(r.alternative ? [`The closest alternative is ${r.alternative.name}, at ${r.alternative.total} a month.`] : []),
            ],
            facts: [
              ["Plan", r.plan.name],
              ["Per person", `${r.plan.unit} a month`],
              ["Monthly total", r.plan.total],
            ],
            button: { label: "Order it now", url: order },
            footnote: "Open an account and the order is ready with your numbers. You can change them before you confirm.",
          },
        };
      }
      if (step === 1) {
        return {
          subject: "Moving your email across without losing a message",
          body: {
            heading: "How the move works",
            paragraphs: [
              hello(c.name),
              `We set up ${r.plan.name} beside what you use today, copy every mailbox across, and switch your domain over at a quiet time. Mail that arrives during the move is copied too.`,
              "Your people sign in with the same email address the next morning. We stay on hand for the first week for anything that looks different.",
            ],
            button: { label: "Order it now", url: order },
          },
        };
      }
      return {
        subject: "Questions before you switch?",
        body: {
          heading: "Talk it through with an engineer",
          paragraphs: [hello(c.name), "If you're weighing up plans, licences for part of the team, or keeping some mailboxes where they are, a short call usually settles it."],
          button: callOrQuote(c, "cost-calculator"),
        },
      };
    }
    case "DPA_CHECKLIST": {
      const r = c.result as ReadinessResult | null;
      if (!r?.token) return null;
      const summary = `${c.appUrl}/sign-up?next=${encodeURIComponent(`/app/readiness/${r.token}`)}`;
      if (step === 0) {
        return {
          subject: `Your data protection readiness: ${r.score} out of 100`,
          body: {
            heading: `You scored ${r.score} out of 100`,
            paragraphs: [
              hello(c.name),
              r.steps.length ? `These are your next steps under the ${r.law}, most important first:` : `You answered yes to everything we ask about the ${r.law}. Keep the records up to date.`,
              ...r.steps.slice(0, 5),
            ],
            button: { label: "Download your summary", url: summary },
            footnote: "Open a free account to download the full summary as a PDF. This checklist is a guide, not legal advice.",
          },
        };
      }
      if (step === 1) {
        return {
          subject: "Three records worth keeping",
          body: {
            heading: "Records that show you take care of personal information",
            paragraphs: [
              hello(c.name),
              "A list of the personal information you hold: what it is, why you hold it, where it is kept and who can see it.",
              "A record of consent where you rely on it, such as for marketing emails: who agreed, to what, and when.",
              "A log of incidents: anything that went wrong with personal information, what you did about it and who you told.",
              "Kept up to date, these three answer most of what a regulator or a customer will ask.",
            ],
            button: { label: "Download your summary", url: summary },
          },
        };
      }
      return {
        subject: "Help with your next steps",
        body: {
          heading: "We can help with the technical side",
          paragraphs: [
            hello(c.name),
            "Two-step login for everyone, backups we test, devices that are watched and patched, and records of who accessed what: that is the technical half of data protection, and it is what we do.",
          ],
          button: callOrQuote(c, "data-protection"),
        },
      };
    }
    case "ASSISTANT":
    case "PERSON":
      return {
        subject: "Did we answer your question?",
        body: {
          heading: "Did we answer your question?",
          paragraphs: [
            hello(c.name),
            `A few days ago you asked us about this: "${c.need.split("\n\nEarlier:")[0].slice(0, 300)}"`,
            c.bookingUrl
              ? "If you still need help, reply to this email or book a call with one of our engineers at a time that suits you."
              : "If you still need help, reply to this email and we'll pick it up.",
          ],
          ...(c.bookingUrl ? { button: { label: "Book a call", url: c.bookingUrl } } : {}),
        },
      };
    case "QUOTE":
      return {
        subject: "Questions about your quote?",
        body: {
          heading: "Anything we can clear up?",
          paragraphs: [hello(c.name), "If anything in your quote is unclear, or you'd like it changed, reply to this email or talk it through with one of our engineers."],
          button: callOrQuote(c, "quote"),
        },
      };
    case "NEWSLETTER":
      return {
        subject: "Three free checks for your business",
        body: {
          heading: "Before the first insights email",
          paragraphs: [
            hello(c.name),
            "Thanks for signing up. These take a minute each: an email security check for your domain, a Microsoft 365 and Google Workspace cost calculator, and a data protection readiness checklist.",
          ],
          button: { label: "Try the free tools", url: tools },
        },
      };
    default:
      return null;
  }
}
