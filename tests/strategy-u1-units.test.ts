import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimsBotswanaData, withDataClaims } from "../src/lib/data-claims";
import { money } from "../src/lib/domain/money";
import { senderAddress } from "../src/server/billing/whmcs/company-push";
import { signSync } from "../src/server/billing/whmcs/price-sync";
import { pngSize } from "../src/server/company/company";
import { renderBusinessPdf } from "../src/server/documents/business-pdf";
import { EppRegistry, eppPhone, type EppTransport } from "../src/server/domains/epp";
import { parseDnsRecords } from "../src/server/domains/manage";
import { OpenproviderRegistrar, splitPhone } from "../src/server/domains/openprovider";
import { parseNameservers, RegistrarError, splitDomain } from "../src/server/domains/registrar";
import { openSecrets, openValue, sealSecrets, sealValue } from "../src/server/partners/vault";

// The partner vault's key comes from TOTP_ENCRYPTION_KEY, which the check job doesn't set.
const TOTP = process.env.TOTP_ENCRYPTION_KEY;
beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
});
afterAll(() => {
  if (TOTP === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = TOTP;
});

describe("data kept in Botswana", () => {
  it("holds back lines that say where data is kept, and nothing else", () => {
    const lines = ["Hosted in Gaborone", "Daily copy of Microsoft 365 data", "Stored in Gaborone", "Monitoring around the clock", "A copy of your data kept in Botswana."];
    expect(withDataClaims(lines, false)).toEqual(["Daily copy of Microsoft 365 data", "Monitoring around the clock"]);
    expect(withDataClaims(lines, true)).toEqual(lines);
    expect(claimsBotswanaData("Off-site backup copy, tested monthly")).toBe(false);
    expect(claimsBotswanaData("24/7 security operations centre")).toBe(false);
  });
});

describe("partner vault", () => {
  it("seals credentials so they can't be read from the database", () => {
    const sealed = sealSecrets({ password: "s3cret", key: "-----BEGIN KEY-----" });
    expect(sealed).not.toContain("s3cret");
    expect(openSecrets(sealed)).toEqual({ password: "s3cret", key: "-----BEGIN KEY-----" });
    expect(openSecrets("")).toEqual({});
    expect(openValue(sealValue("EPP-AUTH-123"))).toBe("EPP-AUTH-123");
    // Tampering is caught, not decrypted to rubbish.
    const v = sealValue("abc");
    expect(() => openValue(v.slice(0, -4) + (v.endsWith("AAAA") ? "BBBB" : "AAAA"))).toThrow();
  });
});

describe("domain inputs", () => {
  it("reads nameservers one per line", () => {
    expect(parseNameservers("NS1.Example.com\nns2.example.com.\n\n")).toEqual(["ns1.example.com", "ns2.example.com"]);
    expect(typeof parseNameservers("ns1.example.com")).toBe("string");
    expect(typeof parseNameservers("ns1.example.com\nnot a host")).toBe("string");
  });

  it("splits a name at its ending", () => {
    expect(splitDomain("Kgale-Hill.co.bw", ["co.bw", "bw"])).toEqual(["kgale-hill", "co.bw"]);
    expect(splitDomain("example.com", [])).toEqual(["example", "com"]);
  });

  it("checks every DNS record before anything is sent", () => {
    const ok = parseDnsRecords([
      { type: "a", name: "@", value: "203.0.113.10", ttl: "", priority: "" },
      { type: "MX", name: "", value: "mail.example.com", ttl: "3600", priority: "" },
      { type: "TXT", name: "_dmarc", value: "v=DMARC1; p=quarantine", ttl: "600", priority: "" },
      { type: "", name: "", value: "", ttl: "", priority: "" },
    ]);
    expect(ok).toEqual([
      { type: "A", name: "", value: "203.0.113.10", ttl: 3600 },
      { type: "MX", name: "", value: "mail.example.com", ttl: 3600, priority: 10 },
      { type: "TXT", name: "_dmarc", value: "v=DMARC1; p=quarantine", ttl: 600 },
    ]);
    try {
      parseDnsRecords([
        { type: "A", name: "www", value: "not-an-ip", ttl: "5", priority: "" },
        { type: "BOGUS", name: "bad name!", value: "x", ttl: "", priority: "" },
      ]);
      expect.unreachable();
    } catch (e) {
      expect((e as { fieldErrors: Record<string, string> }).fieldErrors).toMatchObject({ "value-0": expect.any(String), "ttl-0": expect.any(String), "type-1": expect.any(String), "name-1": expect.any(String) });
    }
  });

  it("writes phone numbers the way each registry wants them", () => {
    expect(splitPhone("+267 390 0000")).toEqual({ country_code: "+267", area_code: "", subscriber_number: "3900000" });
    expect(eppPhone("+267 390 0000")).toBe("+267.3900000");
  });
});

/** A fake Openprovider REST API: answers by method and path. */
function fakeOpenprovider(routes: Record<string, (body: unknown) => { status?: number; json: unknown }>) {
  const calls: { method: string; path: string; body: unknown; auth?: string }[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+\/v1beta/, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: String(init.method), path, body, auth: (init.headers as Record<string, string>).Authorization });
    const route = Object.entries(routes).find(([k]) => k === `${init.method} ${path.split("?")[0]}`);
    const answer = route ? route[1](body) : { status: 404, json: { code: 1, desc: "not found" } };
    return new Response(JSON.stringify(answer.json), { status: answer.status ?? 200 });
  };
  return { fetchFn, calls };
}

describe("Openprovider", () => {
  const login = () => ({ json: { code: 0, data: { token: "tok-1" } } });

  it("signs in once and checks availability", async () => {
    const op = fakeOpenprovider({
      "POST /auth/login": login,
      "POST /domains/check": () => ({ json: { code: 0, data: { results: [{ domain: "free-name.com", status: "free" }, { domain: "taken.com", status: "active" }, { domain: "shiny.com", status: "free", is_premium: true }] } } }),
    });
    const r = new OpenproviderRegistrar({ username: "u", password: "p", environment: "sandbox" }, op.fetchFn);
    const found = await r.check(["free-name.com", "taken.com", "shiny.com"]);
    expect(found).toEqual([
      { name: "free-name.com", available: true, premium: false },
      { name: "taken.com", available: false, premium: false },
      { name: "shiny.com", available: true, premium: true },
    ]);
    await r.check(["free-name.com"]);
    expect(op.calls.filter((c) => c.path === "/auth/login")).toHaveLength(1);
    expect(op.calls[1].body).toMatchObject({ domains: [{ name: "free-name", extension: "com" }, { name: "taken", extension: "com" }, { name: "shiny", extension: "com" }] });
    expect(op.calls[1].auth).toBe("Bearer tok-1");
  });

  it("says plainly when the sign-in is refused", async () => {
    const op = fakeOpenprovider({ "POST /auth/login": () => ({ status: 401, json: { code: 196, desc: "Authentication failed" } }) });
    const r = new OpenproviderRegistrar({ username: "u", password: "wrong", environment: "live" }, op.fetchFn);
    await expect(r.test()).rejects.toMatchObject({ code: "auth", message: expect.stringContaining("refused the username or password") });
  });

  it("reads a domain, changes its nameservers and gives its transfer code", async () => {
    const op = fakeOpenprovider({
      "POST /auth/login": login,
      "GET /domains": () => ({ json: { code: 0, data: { results: [{ id: 42, domain: { name: "kgale", extension: "com" }, status: "ACT", expiration_date: "2027-03-01 10:00:00", name_servers: [{ name: "NS1.openprovider.nl" }], owner_handle: "XX123" }] } } }),
      "PUT /domains/42": () => ({ json: { code: 0, data: {} } }),
      "GET /domains/42/authcode": () => ({ json: { code: 0, data: { auth_code: "Ab#12345" } } }),
    });
    const r = new OpenproviderRegistrar({ username: "u", password: "p", environment: "live" }, op.fetchFn);
    expect(await r.info("kgale.com")).toEqual({ name: "kgale.com", status: "active", expiresOn: new Date("2027-03-01T00:00:00Z"), nameservers: ["ns1.openprovider.nl"], locked: undefined });
    await r.setNameservers("kgale.com", ["ns1.example.com", "ns2.example.com"]);
    expect(op.calls.find((c) => c.method === "PUT")?.body).toEqual({ name_servers: [{ name: "ns1.example.com" }, { name: "ns2.example.com" }] });
    expect(await r.authCode("kgale.com")).toBe("Ab#12345");
    expect(await r.info("other.com")).toBeNull();
  });

  it("edits DNS records by adding and removing only what changed", async () => {
    const op = fakeOpenprovider({
      "POST /auth/login": login,
      "GET /dns/zones/kgale.com": () => ({
        json: {
          code: 0,
          data: { records: [{ type: "SOA", name: "kgale.com", value: "x" }, { type: "A", name: "kgale.com", value: "203.0.113.1", ttl: 3600 }, { type: "MX", name: "kgale.com", value: "mx.example.com", ttl: 3600, prio: 10 }] },
        },
      }),
      "PUT /dns/zones/kgale.com": () => ({ json: { code: 0, data: {} } }),
    });
    const r = new OpenproviderRegistrar({ username: "u", password: "p", environment: "live" }, op.fetchFn);
    expect(await r.dnsRecords("kgale.com")).toEqual([
      { type: "A", name: "", value: "203.0.113.1", ttl: 3600 },
      { type: "MX", name: "", value: "mx.example.com", ttl: 3600, priority: 10 },
    ]);
    await r.saveDnsRecords("kgale.com", [
      { type: "A", name: "", value: "203.0.113.2", ttl: 3600 },
      { type: "MX", name: "", value: "mx.example.com", ttl: 3600, priority: 10 },
    ]);
    expect(op.calls.find((c) => c.method === "PUT")?.body).toEqual({
      name: "kgale.com",
      records: { add: [{ type: "A", name: "", value: "203.0.113.2", ttl: 3600 }], remove: [{ type: "A", name: "", value: "203.0.113.1", ttl: 3600 }] },
    });
  });

  it("reads our cost for an ending", async () => {
    const prices: Record<string, number> = { create: 9.5, renew: 10.25, transfer: 9.5 };
    const op = fakeOpenprovider({ "POST /auth/login": login });
    const fetchFn = async (url: string, init: RequestInit) => {
      if (url.includes("/domains/prices")) {
        const operation = new URL(url).searchParams.get("operation")!;
        return new Response(JSON.stringify({ code: 0, data: { price: { reseller: { price: prices[operation], currency: "USD" } } } }));
      }
      return op.fetchFn(url, init);
    };
    const r = new OpenproviderRegistrar({ username: "u", password: "p", environment: "live" }, fetchFn);
    expect(await r.cost(".com")).toEqual({ register: money(950n, "USD"), renew: money(1025n, "USD"), transfer: money(950n, "USD") });
  });

  it("calls a network failure unreachable, so domain search falls back", async () => {
    const r = new OpenproviderRegistrar({ username: "u", password: "p", environment: "live" }, async () => {
      throw new TypeError("fetch failed");
    });
    await expect(r.check(["a.com"])).rejects.toBeInstanceOf(RegistrarError);
    await expect(r.check(["a.com"])).rejects.toMatchObject({ code: "unreachable" });
  });
});

describe(".bw registry over EPP", () => {
  function transport(answers: ((xml: string) => string)[]) {
    const sent: string[] = [];
    let closed = false;
    const t: EppTransport = {
      greeting: "<greeting/>",
      send: async (xml) => {
        sent.push(xml);
        const next = answers.shift();
        return next ? next(xml) : `<epp><response><result code="1500"><msg>Bye</msg></result></response></epp>`;
      },
      close: async () => {
        closed = true;
      },
    };
    return { t, sent, closed: () => closed };
  }
  const ok = (extra = "") => () => `<epp><response><result code="1000"><msg>OK</msg></result>${extra}</response></epp>`;
  const config = { host: "epp.example.bw", port: 700, clientId: "fgt", password: "pw&<x>", contactPrefix: "FGT", nameservers: [] };

  it("signs in, checks names and signs out", async () => {
    const x = transport([ok(), ok(`<resData><domain:chkData><domain:cd><domain:name avail="1">free.co.bw</domain:name></domain:cd><domain:cd><domain:name avail="0">mascom.co.bw</domain:name></domain:cd></domain:chkData></resData>`)]);
    const r = new EppRegistry(config, async () => x.t);
    expect(await r.check(["free.co.bw", "mascom.co.bw"])).toEqual([
      { name: "free.co.bw", available: true },
      { name: "mascom.co.bw", available: false },
    ]);
    expect(x.sent[0]).toContain("<clID>fgt</clID><pw>pw&amp;&lt;x&gt;</pw>");
    expect(x.sent[2]).toContain("<logout/>");
    expect(x.closed()).toBe(true);
  });

  it("turns registry errors into plain messages", async () => {
    const x = transport([() => `<epp><response><result code="2200"><msg>Authentication error</msg></result></response></epp>`]);
    const r = new EppRegistry(config, async () => x.t);
    await expect(r.test()).rejects.toMatchObject({ code: "auth", message: ".bw registry: Authentication error (2200)" });
    const down = new EppRegistry(config, async () => {
      throw new Error("connect ECONNREFUSED");
    });
    await expect(down.test()).rejects.toMatchObject({ code: "unreachable" });
  });
});

describe("company logo and WHMCS push helpers", () => {
  it("reads a PNG's size", () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(1280, 16);
    png.writeUInt32BE(340, 20);
    expect(pngSize(png)).toEqual({ width: 1280, height: 340 });
    expect(pngSize(Buffer.from("GIF89a"))).toBeNull();
  });

  it("sends WHMCS email only from a real address", () => {
    expect(senderAddress("Fourth Generation Technologies <billing@fourthgeneration.technology>")).toBe("billing@fourthgeneration.technology");
    expect(senderAddress("no address here")).toBeNull();
  });

  it("signs the company push the way the addon checks it", () => {
    // The same vector as whmcs/tests/run.php.
    expect(signSync("test-secret-that-is-at-least-32-chars", "1790000000", "0123456789abcdef0123456789abcdef", '{"operations":[]}')).toBe("v1=5c4bedec0e12267fa5ba28250c754f2bca6cb87534c1e72fc8a29d893106708d");
  });
});

describe("business PDFs", () => {
  it("renders a long document onto several pages", async () => {
    const { brandAsset } = await import("../src/server/company/company");
    const logo = await brandAsset("png", "fgt-logo-1280.png");
    const pdf = await renderBusinessPdf(
      {
        kind: "Invoice",
        number: "INV-2026-0001",
        status: "Unpaid",
        from: { name: "Fourth Generation Technologies (Pty) Ltd", lines: ["Plot 27860, Block 3", "Gaborone"] },
        to: { name: "Molepolole Mills", lines: ["Plot 1", "Molepolole"] },
        facts: [
          ["Issued", "1 Oct 2026"],
          ["Due", "15 Oct 2026"],
        ],
        lines: Array.from({ length: 60 }, (_, i) => ({ description: `Microsoft 365 Business Standard, user ${i + 1}`, amount: "P 208.00" })),
        totals: [["Total", "P 12,480.00", true]],
        payment: { heading: "Pay by bank transfer (EFT)", rows: [["Bank", "First National Bank Botswana"], ["Payment reference", "INV-2026-0001"]], link: { label: "Pay online", url: "https://console.example.co.bw/app/billing/invoices/1" } },
        terms: ["Payment is due by the due date shown."],
        footer: ["Fourth Generation Technologies (Pty) Ltd · Registration BW00001816431"],
      },
      logo,
      { title: "Invoice INV-2026-0001", author: "Fourth Generation Technologies (Pty) Ltd" },
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe("Invoice INV-2026-0001");
  });
});
