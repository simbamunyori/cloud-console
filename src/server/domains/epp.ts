import { randomBytes } from "node:crypto";
import tls from "node:tls";
import { RegistrarError, type Availability, type Registrar, type RegistrarContact, type RegistrarDomain } from "./registrar";

/**
 * The .bw registry (BOCRA, run on CoCCA) over EPP: RFC 5730 to 5734, over
 * TLS with our client certificate. Built now and switched off; it is set
 * up in Admin > Partners > .bw registry once BOCRA accredits us and confirms
 * its requirements. Anything registry-specific beyond plain EPP goes in the
 * partner settings, not here.
 */

export interface EppConfig {
  host: string;
  port: number;
  clientId: string;
  password: string;
  /** PEM, when the registry asks for a client certificate. */
  certificate?: string;
  privateKey?: string;
  /** Contacts we create are named with this and a random part, e.g. "FGT-1A2B3C4D". */
  contactPrefix: string;
  nameservers: string[];
}

export interface EppTransport {
  greeting: string;
  send(xml: string): Promise<string>;
  close(): Promise<void>;
}

const TIMEOUT_MS = 30_000;

/** A TLS connection with EPP's framing: a 4-byte length, then the XML. */
export function tlsTransport(config: Pick<EppConfig, "host" | "port" | "certificate" | "privateKey">): Promise<EppTransport> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: config.host, port: config.port, servername: config.host, cert: config.certificate || undefined, key: config.privateKey || undefined });
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error("The registry didn't answer in time.")));
    let buffer = Buffer.alloc(0);
    const waiting: ((frame: string) => void)[] = [];
    const frames: string[] = [];
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (buffer.length < length) break;
        const frame = buffer.subarray(4, length).toString("utf8");
        buffer = buffer.subarray(length);
        const next = waiting.shift();
        if (next) next(frame);
        else frames.push(frame);
      }
    });
    const nextFrame = () => new Promise<string>((res) => (frames.length ? res(frames.shift()!) : waiting.push(res)));
    socket.once("error", reject);
    socket.once("secureConnect", async () => {
      const greeting = await nextFrame();
      resolve({
        greeting,
        send: async (xml) => {
          const body = Buffer.from(xml, "utf8");
          const head = Buffer.alloc(4);
          head.writeUInt32BE(body.length + 4);
          socket.write(Buffer.concat([head, body]));
          return nextFrame();
        },
        close: async () => {
          socket.end();
        },
      });
    });
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const unesc = (s: string) => s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[e]!);

/** Every text value of an element, whatever its namespace prefix. */
export function texts(xml: string, local: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${local}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${local}>`, "g");
  return [...xml.matchAll(re)].map((m) => unesc(m[1].trim()));
}
const text = (xml: string, local: string) => texts(xml, local)[0] ?? "";

const NS = {
  epp: "urn:ietf:params:xml:ns:epp-1.0",
  domain: "urn:ietf:params:xml:ns:domain-1.0",
  contact: "urn:ietf:params:xml:ns:contact-1.0",
  host: "urn:ietf:params:xml:ns:host-1.0",
};

const command = (inner: string) => `<?xml version="1.0" encoding="UTF-8" standalone="no"?><epp xmlns="${NS.epp}"><command>${inner}<clTRID>FGT-${randomBytes(6).toString("hex")}</clTRID></command></epp>`;

const authPw = () => randomBytes(12).toString("base64url");

export class EppRegistry implements Registrar {
  readonly key = "bw-registry" as const;

  constructor(
    private readonly config: EppConfig,
    private readonly connect: (c: EppConfig) => Promise<EppTransport> = tlsTransport,
  ) {}

  /** One connection per piece of work: sign in, do it, sign out. */
  private async session<T>(work: (run: (inner: string) => Promise<string>) => Promise<T>): Promise<T> {
    let transport: EppTransport;
    try {
      transport = await this.connect(this.config);
    } catch (e) {
      throw new RegistrarError(`Couldn't reach the .bw registry at ${this.config.host}: ${(e as Error).message}`, "unreachable");
    }
    const run = async (inner: string) => {
      const answer = await transport.send(command(inner));
      const code = Number(/<result\s+code="(\d{4})"/.exec(answer)?.[1] ?? 0);
      if (code < 1000 || code >= 2000) {
        const msg = text(answer, "msg") || "no reason given";
        throw new RegistrarError(`.bw registry: ${msg} (${code || "no result"})`, code === 2303 ? "not-found" : code === 2200 || code === 2202 ? "auth" : "refused");
      }
      return answer;
    };
    try {
      await run(
        `<login><clID>${esc(this.config.clientId)}</clID><pw>${esc(this.config.password)}</pw><options><version>1.0</version><lang>en</lang></options><svcs><objURI>${NS.domain}</objURI><objURI>${NS.contact}</objURI><objURI>${NS.host}</objURI></svcs></login>`,
      );
      return await work(run);
    } finally {
      await run("<logout/>").catch(() => undefined);
      await transport.close().catch(() => undefined);
    }
  }

  async test() {
    return this.session(async () => `Signed in to the .bw registry at ${this.config.host} as ${this.config.clientId}.`);
  }

  async check(names: string[]): Promise<Availability[]> {
    if (!names.length) return [];
    const answer = await this.session((run) => run(`<check><domain:check xmlns:domain="${NS.domain}">${names.map((n) => `<domain:name>${esc(n.toLowerCase())}</domain:name>`).join("")}</domain:check></check>`));
    const avail = new Map([...answer.matchAll(/<(?:[\w-]+:)?name\s+avail="(true|false|1|0)"\s*>([^<]+)</g)].map((m) => [m[2].trim().toLowerCase(), m[1] === "1" || m[1] === "true"]));
    return names.map((n) => ({ name: n.toLowerCase(), available: avail.get(n.toLowerCase()) ?? false }));
  }

  private infoXml(run: (inner: string) => Promise<string>, name: string) {
    return run(`<info><domain:info xmlns:domain="${NS.domain}"><domain:name hosts="all">${esc(name.toLowerCase())}</domain:name></domain:info></info>`);
  }

  async info(name: string): Promise<RegistrarDomain | null> {
    try {
      const answer = await this.session((run) => this.infoXml(run, name));
      const statuses = [...answer.matchAll(/<(?:[\w-]+:)?status\s+s="([^"]+)"/g)].map((m) => m[1]);
      const ex = text(answer, "exDate");
      return {
        name: name.toLowerCase(),
        status: statuses.includes("ok") ? "active" : statuses.join(", ") || "unknown",
        expiresOn: ex ? new Date(`${ex.slice(0, 10)}T00:00:00Z`) : undefined,
        nameservers: texts(answer, "hostObj").map((h) => h.toLowerCase()),
        locked: statuses.some((s) => s.startsWith("clientTransferProhibited") || s.startsWith("serverTransferProhibited")),
      };
    } catch (e) {
      if (e instanceof RegistrarError && e.code === "not-found") return null;
      throw e;
    }
  }

  async setNameservers(name: string, nameservers: string[]) {
    await this.session(async (run) => {
      const current = texts(await this.infoXml(run, name), "hostObj").map((h) => h.toLowerCase());
      const add = nameservers.filter((n) => !current.includes(n));
      const rem = current.filter((n) => !nameservers.includes(n));
      if (!add.length && !rem.length) return;
      const list = (xs: string[]) => `<domain:ns>${xs.map((h) => `<domain:hostObj>${esc(h)}</domain:hostObj>`).join("")}</domain:ns>`;
      await run(
        `<update><domain:update xmlns:domain="${NS.domain}"><domain:name>${esc(name)}</domain:name>${add.length ? `<domain:add>${list(add)}</domain:add>` : ""}${rem.length ? `<domain:rem>${list(rem)}</domain:rem>` : ""}</domain:update></update>`,
      );
    });
  }

  async getContact(name: string): Promise<RegistrarContact | null> {
    return this.session(async (run) => {
      const id = text(await this.infoXml(run, name), "registrant");
      if (!id) return null;
      const c = await run(`<info><contact:info xmlns:contact="${NS.contact}"><contact:id>${esc(id)}</contact:id></contact:info></info>`);
      const [first, ...rest] = text(c, "name").split(" ");
      return {
        firstName: first ?? "",
        lastName: rest.join(" "),
        companyName: text(c, "org") || undefined,
        email: text(c, "email"),
        phone: text(c, "voice"),
        address: texts(c, "street").join(", "),
        city: text(c, "city"),
        postcode: text(c, "pc") || undefined,
        country: text(c, "cc").toUpperCase(),
      };
    });
  }

  private postal(c: RegistrarContact) {
    return `<contact:postalInfo type="int"><contact:name>${esc(`${c.firstName} ${c.lastName}`.trim())}</contact:name>${c.companyName ? `<contact:org>${esc(c.companyName)}</contact:org>` : ""}<contact:addr><contact:street>${esc(c.address)}</contact:street><contact:city>${esc(c.city)}</contact:city>${c.postcode ? `<contact:pc>${esc(c.postcode)}</contact:pc>` : ""}<contact:cc>${esc(c.country.toUpperCase())}</contact:cc></contact:addr></contact:postalInfo><contact:voice>${esc(eppPhone(c.phone))}</contact:voice><contact:email>${esc(c.email)}</contact:email>`;
  }

  async updateContact(name: string, contact: RegistrarContact) {
    await this.session(async (run) => {
      const id = text(await this.infoXml(run, name), "registrant");
      if (!id) throw new RegistrarError(`${name} has no registrant at the registry.`, "not-found");
      await run(`<update><contact:update xmlns:contact="${NS.contact}"><contact:id>${esc(id)}</contact:id><contact:chg>${this.postal(contact)}</contact:chg></contact:update></update>`);
    });
  }

  async authCode(name: string) {
    const code = await this.session(async (run) => text(await this.infoXml(run, name), "pw"));
    if (!code) throw new RegistrarError(`The registry gave no transfer code for ${name}.`);
    return code;
  }

  private async createContact(run: (inner: string) => Promise<string>, contact: RegistrarContact) {
    const id = `${this.config.contactPrefix}-${randomBytes(4).toString("hex").toUpperCase()}`.slice(0, 16);
    await run(`<create><contact:create xmlns:contact="${NS.contact}"><contact:id>${esc(id)}</contact:id>${this.postal(contact)}<contact:authInfo><contact:pw>${authPw()}</contact:pw></contact:authInfo></contact:create></create>`);
    return id;
  }

  async register(name: string, years: number, contact: RegistrarContact, nameservers: string[]) {
    return this.session(async (run) => {
      const id = await this.createContact(run, contact);
      const ns = nameservers.length ? nameservers : this.config.nameservers;
      const answer = await run(
        `<create><domain:create xmlns:domain="${NS.domain}"><domain:name>${esc(name)}</domain:name><domain:period unit="y">${years}</domain:period>${ns.length ? `<domain:ns>${ns.map((h) => `<domain:hostObj>${esc(h)}</domain:hostObj>`).join("")}</domain:ns>` : ""}<domain:registrant>${esc(id)}</domain:registrant><domain:contact type="admin">${esc(id)}</domain:contact><domain:contact type="tech">${esc(id)}</domain:contact><domain:authInfo><domain:pw>${authPw()}</domain:pw></domain:authInfo></domain:create></create>`,
      );
      return { expiresOn: expiry(answer, years) };
    });
  }

  async renew(name: string, years: number, currentExpiry: Date) {
    return this.session(async (run) => {
      const answer = await run(
        `<renew><domain:renew xmlns:domain="${NS.domain}"><domain:name>${esc(name)}</domain:name><domain:curExpDate>${currentExpiry.toISOString().slice(0, 10)}</domain:curExpDate><domain:period unit="y">${years}</domain:period></domain:renew></renew>`,
      );
      return { expiresOn: expiry(answer, years, currentExpiry) };
    });
  }

  async transfer(name: string, authCode: string) {
    await this.session((run) => run(`<transfer op="request"><domain:transfer xmlns:domain="${NS.domain}"><domain:name>${esc(name)}</domain:name><domain:authInfo><domain:pw>${esc(authCode)}</domain:pw></domain:authInfo></domain:transfer></transfer>`));
  }
}

/** EPP wants +CCC.NNNN: "+267 390 0000" → "+267.3900000". */
export function eppPhone(phone: string) {
  const m = /^\s*\+(\d{1,3})[\s.-]+(.+)$/.exec(phone);
  return m ? `+${m[1]}.${m[2].replace(/\D/g, "")}` : phone.replace(/[^\d+.]/g, "");
}

function expiry(answer: string, years: number, from = new Date()) {
  const ex = text(answer, "exDate");
  if (ex) return new Date(`${ex.slice(0, 10)}T00:00:00Z`);
  const d = new Date(Date.UTC(from.getUTCFullYear() + years, from.getUTCMonth(), from.getUTCDate()));
  return d;
}
