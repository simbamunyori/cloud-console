import { isIP } from "node:net";

/**
 * The free email security check (final build, Milestone 8). A visitor
 * gives a domain and gets a plain-language report from public records
 * only: mail servers, SPF, DKIM under the common selector names, DMARC,
 * the website's certificate and the domain's renewal date. Nothing is
 * scanned: we read DNS, open one HTTPS connection the way a browser
 * does, and ask the registry's public RDAP service for the dates.
 */

export type CheckKey = "mx" | "spf" | "dkim" | "dmarc" | "certificate" | "expiry";
export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export interface Check {
  key: CheckKey;
  status: CheckStatus;
  title: string;
  /** What we found, in plain words. */
  finding: string;
  /** What to do about it. Empty when nothing needs doing. */
  fix: string;
}

export interface EmailReport {
  domain: string;
  /** Who runs their email, when the mail servers say so. */
  provider: "microsoft" | "google" | "other" | null;
  checks: Check[];
  /** 0 to 100: each check that applies counts equally; a warning counts half. */
  score: number;
  checkedAt: string;
}

/** Everything the check reads from the outside world, so tests can stand in for it. */
export interface EmailCheckLookup {
  mx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  txt(name: string): Promise<string[]>;
  /** The website's certificate, or null when no website answers. Throws CertificateError when one answers with a bad certificate. */
  certificate(domain: string): Promise<{ validTo: Date; issuer: string } | null>;
  /** When the registration runs out, or null when the registry doesn't publish it. */
  expiry(domain: string): Promise<Date | null>;
}

export class CertificateError extends Error {}

/** The DKIM selector names the common providers use. */
export const DKIM_SELECTORS = ["selector1", "selector2", "google", "default", "k1", "s1", "s2", "dkim", "mail", "smtp", "zoho", "mxvault"];

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** A domain from what a visitor typed, e.g. "https://www.Example.co.bw/contact" gives "example.co.bw". Null when it isn't one. */
export function cleanDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^[^@/]*@/, "");
  s = s
    .split(/[/?#:]/)[0]
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (!s || s.length > 253 || isIP(s)) return null;
  const labels = s.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !/^[a-z]{2,63}$/.test(labels.at(-1)!)) return null;
  return s;
}

const DAY = 86_400_000;

/** Runs every check. Lookups that fail count as "nothing found", never as an error for the visitor. */
export async function checkEmailSecurity(domain: string, lookup: EmailCheckLookup, now = new Date()): Promise<EmailReport> {
  const safe = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [mx, txt, dmarcTxt, dkim, cert, expiry] = await Promise.all([
    safe(lookup.mx(domain), []),
    safe(lookup.txt(domain), []),
    safe(lookup.txt(`_dmarc.${domain}`), []),
    Promise.all(DKIM_SELECTORS.map(async (s) => ({ selector: s, records: await safe(lookup.txt(`${s}._domainkey.${domain}`), []) }))),
    lookup.certificate(domain).then(
      (c) => ({ ok: true as const, cert: c }),
      (e) => ({ ok: false as const, error: e instanceof CertificateError ? e.message : null }),
    ),
    safe(lookup.expiry(domain), null),
  ]);

  const exchanges = mx.map((m) => m.exchange.toLowerCase().replace(/\.$/, ""));
  const provider = !exchanges.length
    ? null
    : exchanges.some((e) => e.endsWith(".mail.protection.outlook.com"))
      ? "microsoft"
      : exchanges.some((e) => e.endsWith("google.com") || e.endsWith("googlemail.com"))
        ? "google"
        : "other";
  const checks: Check[] = [];

  // Mail servers.
  checks.push(
    exchanges.length
      ? {
          key: "mx",
          status: "pass",
          title: "Mail servers",
          finding:
            provider === "microsoft"
              ? "Email for this domain goes to Microsoft 365."
              : provider === "google"
                ? "Email for this domain goes to Google Workspace."
                : `Email for this domain goes to ${exchanges[0]}${exchanges.length > 1 ? ` and ${exchanges.length - 1} more` : ""}.`,
          fix: "",
        }
      : {
          key: "mx",
          status: "fail",
          title: "Mail servers",
          finding: "This domain lists no mail servers, so email sent to it can't be delivered.",
          fix: "Add MX records for your email provider. If you don't have one yet, Microsoft 365 or Google Workspace on your own domain is the usual choice.",
        },
  );

  // SPF: which servers may send as the domain.
  const spf = txt.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
  if (!spf.length) {
    checks.push({
      key: "spf",
      status: "fail",
      title: "SPF",
      finding: "There is no SPF record, so nothing tells other mail servers who may send email as this domain.",
      fix: `Add a TXT record on ${domain} listing your email provider, e.g. "v=spf1 include:spf.protection.outlook.com -all" for Microsoft 365.`,
    });
  } else if (spf.length > 1) {
    checks.push({
      key: "spf",
      status: "fail",
      title: "SPF",
      finding: `There are ${spf.length} SPF records. Mail servers treat that as an error and ignore all of them.`,
      fix: "Merge them into one record that lists every service that sends your email.",
    });
  } else {
    const record = spf[0].trim();
    const all = /([~?+-]?)all\s*$/i.exec(record)?.[1] ?? null;
    if (all === "+" || (all === "" && /\sall\s*$/i.test(record))) {
      checks.push({
        key: "spf",
        status: "fail",
        title: "SPF",
        finding: "The SPF record ends in +all, which lets any server in the world send as this domain.",
        fix: "Change the end of the record to -all, or ~all while you check every sender is listed.",
      });
    } else if (all === null && /\sredirect=/i.test(record)) {
      checks.push({ key: "spf", status: "pass", title: "SPF", finding: "There is one SPF record, and it hands over to your provider's list of servers.", fix: "" });
    } else if (all === "?" || all === null) {
      checks.push({
        key: "spf",
        status: "warn",
        title: "SPF",
        finding: "There is an SPF record, but it doesn't say what to do with email from servers it doesn't list.",
        fix: "End the record with -all, or ~all while you check every sender is listed.",
      });
    } else {
      checks.push({ key: "spf", status: "pass", title: "SPF", finding: "There is one SPF record, and it tells mail servers to distrust anyone it doesn't list.", fix: "" });
    }
  }

  // DKIM: signatures on outgoing email.
  const keys = dkim.filter((d) => d.records.some((r) => /(^|;)\s*p=[A-Za-z0-9+/=]{20,}/.test(r.replace(/\s+/g, " "))));
  checks.push(
    keys.length
      ? { key: "dkim", status: "pass", title: "DKIM", finding: `Outgoing email is signed: we found a DKIM key under "${keys[0].selector}".`, fix: "" }
      : {
          key: "dkim",
          status: "warn",
          title: "DKIM",
          finding: "We didn't find a DKIM key under the names the common providers use. Your provider may use another name, or signing may be off.",
          fix:
            provider === "microsoft"
              ? "Turn on DKIM signing for the domain in the Microsoft Defender portal, then add the two CNAME records it shows you."
              : provider === "google"
                ? "Generate a DKIM key in the Google Admin console (Gmail, Authenticate email) and add the TXT record it gives you."
                : "Ask your email provider for your DKIM record and add it to your DNS.",
        },
  );

  // DMARC: what receivers do with email that fails the checks.
  const dmarc = dmarcTxt.find((t) => /^v=DMARC1/i.test(t.trim()));
  if (!dmarc) {
    checks.push({
      key: "dmarc",
      status: "fail",
      title: "DMARC",
      finding: "There is no DMARC record, so anyone can send email that looks as if it comes from this domain, and you won't hear about it.",
      fix: `Add a TXT record at _dmarc.${domain}, starting with "v=DMARC1; p=none; rua=mailto:" and an address for reports. Move to p=quarantine once the reports look right.`,
    });
  } else {
    const policy = /(?:^|;)\s*p\s*=\s*(\w+)/i.exec(dmarc)?.[1]?.toLowerCase();
    const reports = /(?:^|;)\s*rua\s*=/i.test(dmarc);
    if (policy === "quarantine" || policy === "reject") {
      checks.push({
        key: "dmarc",
        status: "pass",
        title: "DMARC",
        finding: `DMARC is set to ${policy}, so email that fails the checks is ${policy === "reject" ? "turned away" : "sent to junk"}.${reports ? "" : " No address receives the reports, though."}`,
        fix: reports ? "" : "Add rua=mailto: and an address to the record, so you see who sends as your domain.",
      });
    } else {
      checks.push({
        key: "dmarc",
        status: "warn",
        title: "DMARC",
        finding: "DMARC is only watching (p=none). Email that fails the checks is still delivered.",
        fix: `Once the reports show only your own services, change the policy to p=quarantine in the record at _dmarc.${domain}.`,
      });
    }
  }

  // The website's certificate.
  if (!cert.ok) {
    checks.push({
      key: "certificate",
      status: "fail",
      title: "Website certificate",
      finding: cert.error ? `The website answers, but browsers will warn visitors: ${cert.error}` : "The website answers, but its certificate isn't valid, so browsers will warn visitors.",
      fix: "Install a valid certificate for the domain and www. Most hosts offer a free one that renews itself.",
    });
  } else if (!cert.cert) {
    checks.push({ key: "certificate", status: "unknown", title: "Website certificate", finding: `No website answered securely at ${domain}.`, fix: "" });
  } else {
    const days = Math.floor((cert.cert.validTo.getTime() - now.getTime()) / DAY);
    checks.push(
      days < 0
        ? {
            key: "certificate",
            status: "fail",
            title: "Website certificate",
            finding: "The website's certificate has run out, so browsers warn visitors away.",
            fix: "Renew the certificate now, and set it to renew itself.",
          }
        : days < 14
          ? {
              key: "certificate",
              status: "warn",
              title: "Website certificate",
              finding: `The website's certificate runs out in ${days} day${days === 1 ? "" : "s"}.`,
              fix: "Check it renews itself in time, or renew it now.",
            }
          : { key: "certificate", status: "pass", title: "Website certificate", finding: `The website has a valid certificate from ${cert.cert.issuer}, good for another ${days} days.`, fix: "" },
    );
  }

  // The domain's renewal date.
  if (!expiry) {
    checks.push({
      key: "expiry",
      status: "unknown",
      title: "Domain renewal",
      finding: "The registry for this ending doesn't publish renewal dates, so we couldn't read it.",
      fix: "Check the date with whoever registered the domain, and make sure it renews automatically.",
    });
  } else {
    const days = Math.floor((expiry.getTime() - now.getTime()) / DAY);
    const on = expiry.toISOString().slice(0, 10);
    checks.push(
      days < 0
        ? {
            key: "expiry",
            status: "fail",
            title: "Domain renewal",
            finding: `The registration ran out on ${on}. Email and the website stop when it lapses for good.`,
            fix: "Renew it with your registrar today.",
          }
        : days < 30
          ? {
              key: "expiry",
              status: "warn",
              title: "Domain renewal",
              finding: `The domain is registered until ${on}, ${days} day${days === 1 ? "" : "s"} from now.`,
              fix: "Renew it now, or move it to us and we'll renew it automatically.",
            }
          : { key: "expiry", status: "pass", title: "Domain renewal", finding: `The domain is registered until ${on}.`, fix: "" },
    );
  }

  const counted = checks.filter((c) => c.status !== "unknown");
  const points = counted.reduce((n, c) => n + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  return { domain, provider, checks, score: counted.length ? Math.round((points / counted.length) * 100) : 0, checkedAt: now.toISOString() };
}

/** The products that fix what the report found. Only those on sale in the market are shown. */
export function matchingProducts(report: Pick<EmailReport, "checks" | "provider">): string[] {
  const bad = new Set(report.checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => c.key));
  const slugs: string[] = [];
  if (bad.has("mx") || (report.provider === "other" && (bad.has("spf") || bad.has("dkim") || bad.has("dmarc")))) {
    slugs.push("microsoft-365-business-standard", "google-workspace-business-standard", "business-email");
  }
  if (bad.has("spf") || bad.has("dkim") || bad.has("dmarc")) slugs.push("managed-support");
  if (report.provider === "microsoft") slugs.push("backup-microsoft-365");
  if (report.provider === "google") slugs.push("backup-google-workspace");
  if (bad.has("certificate")) slugs.push("ssl-certificate", "web-hosting");
  return [...new Set(slugs)];
}

export const STATUS_WORD: Record<CheckStatus, string> = { pass: "Good", warn: "Needs attention", fail: "Fix this", unknown: "Not checked" };
