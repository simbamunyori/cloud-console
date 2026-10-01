import "server-only";
import { promises as dns } from "node:dns";
import { BlockList, isIP } from "node:net";
import tls from "node:tls";
import { CertificateError, type EmailCheckLookup } from "./email-check";

/**
 * The real lookups behind the email security check: public DNS, one TLS
 * handshake with the website (as a browser makes), and RDAP for the
 * renewal date. The website is only contacted at a public address, so
 * the check can never be pointed at our own network.
 */

const TIMEOUT_MS = 5000;

const PRIVATE = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const)
  PRIVATE.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["::ffff:0:0", 96],
] as const)
  PRIVATE.addSubnet(net, bits, "ipv6");

export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip);
  return v !== 0 && !PRIVATE.check(ip, v === 4 ? "ipv4" : "ipv6");
}

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms))]);
}

const notFound = (e: unknown) => ["ENOTFOUND", "ENODATA", "ENOTIMP", "NXDOMAIN"].includes((e as { code?: string }).code ?? "");

async function addressOf(domain: string): Promise<string | null> {
  const v4 = await withTimeout(dns.resolve4(domain)).catch(() => [] as string[]);
  const v6 = v4.length ? [] : await withTimeout(dns.resolve6(domain)).catch(() => [] as string[]);
  const all = [...v4, ...v6];
  // Every address must be public: a domain pointing anywhere private is not checked at all.
  if (!all.length || !all.every(isPublicAddress)) return null;
  return all[0];
}

function handshake(ip: string, servername: string): Promise<{ validTo: Date; issuer: string } | null> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: ip, port: 443, servername, rejectUnauthorized: false, timeout: TIMEOUT_MS });
    const done = (fn: () => void) => {
      socket.destroy();
      fn();
    };
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!cert?.valid_to) return done(() => resolve(null));
      const issuer = (cert.issuer?.O as string | undefined) ?? (cert.issuer?.CN as string | undefined) ?? "an unknown issuer";
      if (!socket.authorized) {
        const why = String(socket.authorizationError ?? "");
        const words = /HOSTNAME|ALTNAME|IP: /.test(why)
          ? "the certificate is for a different name."
          : /SELF_SIGNED/.test(why)
            ? "the certificate is self-signed."
            : /EXPIRED/.test(why)
              ? "the certificate has run out."
              : "browsers don't trust who issued the certificate.";
        return done(() => reject(new CertificateError(words)));
      }
      done(() => resolve({ validTo: new Date(cert.valid_to), issuer }));
    });
    socket.once("timeout", () => done(() => resolve(null)));
    socket.once("error", () => done(() => resolve(null)));
  });
}

/** The renewal date from the registry's RDAP service, found through rdap.org. */
async function rdapExpiry(domain: string): Promise<Date | null> {
  const res = await withTimeout(fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { accept: "application/rdap+json" }, redirect: "follow" }));
  if (!res.ok) return null;
  const body = (await res.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
  const at = body.events?.find((e) => e.eventAction === "expiration")?.eventDate;
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export const liveLookup: EmailCheckLookup = {
  async mx(domain) {
    return withTimeout(dns.resolveMx(domain)).catch((e) => (notFound(e) ? [] : Promise.reject(e)));
  },
  async txt(name) {
    const rows = await withTimeout(dns.resolveTxt(name)).catch((e) => (notFound(e) ? [] : Promise.reject(e)));
    return rows.map((parts) => parts.join(""));
  },
  async certificate(domain) {
    const ip = await addressOf(domain);
    return ip ? handshake(ip, domain) : null;
  },
  async expiry(domain) {
    return rdapExpiry(domain).catch(() => null);
  },
};

/**
 * Demo and CI servers (TOOLS_DEMO=yes, never in production unless it is
 * a demo server) answer from fixed records, so the pages can be checked
 * offline: "secure.example" passes, anything else is
 * missing DMARC and DKIM.
 */
export const demoLookup: EmailCheckLookup = {
  async mx(domain) {
    return [{ exchange: `${domain.replace(/\./g, "-")}.mail.protection.outlook.com`, priority: 0 }];
  },
  async txt(name) {
    const secure = name.endsWith("secure.example");
    if (name.startsWith("_dmarc.")) return secure ? ["v=DMARC1; p=reject; rua=mailto:dmarc@secure.example"] : [];
    if (name.includes("._domainkey.")) return secure && name.startsWith("selector1.") ? ["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC"] : [];
    return ["v=spf1 include:spf.protection.outlook.com " + (secure ? "-all" : "?all")];
  },
  async certificate() {
    return { validTo: new Date(Date.now() + 80 * 86_400_000), issuer: "Let's Encrypt" };
  },
  async expiry() {
    return new Date(Date.now() + 200 * 86_400_000);
  },
};

export function emailCheckLookup(): EmailCheckLookup {
  const demo = process.env.TOOLS_DEMO === "yes" && (process.env.NODE_ENV !== "production" || process.env.ALLOW_PLACEHOLDERS === "yes");
  return demo ? demoLookup : liveLookup;
}
