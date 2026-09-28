import { parseMoney, toPlainAmount, type Money } from "@/lib/domain/money";
import { DomainError } from "@/server/org/access";
import type { CardCharge, PaymentAdapter, PaymentCheck, PaymentOutcome } from "./adapter";

/**
 * DPO Pay (Network International's DPO Group) through its hosted payment
 * page, so card numbers never touch the console. Two calls to its XML API:
 * createToken starts a transaction and gives the token for the payment
 * page; verifyToken asks what happened. The return address is only a
 * prompt to ask: its query string is never trusted.
 *
 * Test mode is DPO's own: the same addresses with a test company token.
 */

export interface DpoConfig {
  apiUrl: string;
  payUrl: string;
  companyToken: string;
  serviceType: string;
  /** The WHMCS gateway system name card payments are recorded under. */
  gateway: string;
  /** Minutes the payer has to finish on DPO's page. */
  timeLimitMinutes?: number;
}

type Fetch = typeof fetch;

/** XML text content, escaped. */
function esc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function unesc(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** One top-level field of DPO's flat XML answer. */
export function dpoField(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? unesc(m[1].trim()) : undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** DPO's date format, "2026/09/28 14:05", in UTC. */
const dpoDate = (d: Date) => `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

const PENDING = new Set(["001", "003", "005", "007", "900"]);
const FAILED: Record<string, string> = {
  "002": "The card company reported a different amount from the invoice. Our team will check it and refund any difference.",
  "901": "The card company declined the card.",
  "902": "The card company couldn't match the payment details. Try again.",
  "903": "The payment wasn't finished in time. Start again from the invoice.",
  "904": "The payment was cancelled before it went through.",
};

export class DpoGateway implements PaymentAdapter {
  readonly gateway: string;

  constructor(
    private readonly config: DpoConfig,
    private readonly fetcher: Fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.gateway = config.gateway;
  }

  private async call(body: string): Promise<string> {
    const res = await this.fetcher(this.config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body: `<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>${esc(this.config.companyToken)}</CompanyToken>${body}</API3G>`,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`DPO answered HTTP ${res.status}.`);
    return res.text();
  }

  async startCardPayment(charge: CardCharge) {
    const xml = await this.call(
      `<Request>createToken</Request>` +
        `<Transaction>` +
        `<PaymentAmount>${toPlainAmount(charge.amount)}</PaymentAmount>` +
        `<PaymentCurrency>${esc(charge.amount.currency)}</PaymentCurrency>` +
        `<CompanyRef>${esc(charge.paymentRef)}</CompanyRef>` +
        `<RedirectURL>${esc(charge.returnUrl)}</RedirectURL>` +
        `<BackURL>${esc(charge.returnUrl)}</BackURL>` +
        `<CompanyRefUnique>1</CompanyRefUnique>` +
        `<PTL>${this.config.timeLimitMinutes ?? 30}</PTL><PTLtype>minutes</PTLtype>` +
        `</Transaction>` +
        `<Services><Service>` +
        `<ServiceType>${esc(this.config.serviceType)}</ServiceType>` +
        `<ServiceDescription>${esc(charge.description)}</ServiceDescription>` +
        `<ServiceDate>${dpoDate(this.now())}</ServiceDate>` +
        `</Service></Services>`,
    ).catch((e: unknown) => {
      console.error("DPO createToken failed:", e instanceof Error ? e.message : e);
      return "";
    });
    const token = dpoField(xml, "TransToken");
    if (dpoField(xml, "Result") !== "000" || !token) {
      if (xml) console.error(`DPO createToken refused: ${dpoField(xml, "Result")} ${dpoField(xml, "ResultExplanation")}`);
      throw new DomainError("unavailable", "Card payments aren't available right now. Try again in a few minutes, or pay by bank transfer.");
    }
    return { redirectUrl: `${this.config.payUrl}?ID=${encodeURIComponent(token)}`, gatewayToken: token };
  }

  async confirm(check: PaymentCheck): Promise<PaymentOutcome> {
    if (!check.gatewayToken) return { status: "pending" };
    let xml: string;
    try {
      xml = await this.call(`<Request>verifyToken</Request><TransactionToken>${esc(check.gatewayToken)}</TransactionToken>`);
    } catch (e) {
      // Not an answer: leave the payment open and ask again later.
      console.error("DPO verifyToken failed:", e instanceof Error ? e.message : e);
      return { status: "pending" };
    }
    const result = dpoField(xml, "Result") ?? "";
    if (result === "000") {
      if (!sameAmount(xml, check.amount)) return { status: "failed", reason: FAILED["002"] };
      const digits = (dpoField(xml, "CustomerCredit") ?? "").replace(/\D/g, "");
      return { status: "succeeded", paidAt: this.now(), lastFour: digits.length >= 4 ? digits.slice(-4) : undefined };
    }
    if (FAILED[result]) return { status: "failed", reason: FAILED[result] };
    if (!PENDING.has(result)) console.error(`DPO verifyToken: ${result} ${dpoField(xml, "ResultExplanation")}`);
    return { status: "pending" };
  }
}

/** DPO says what it charged; it must be what we asked for. Missing fields are not a mismatch. */
function sameAmount(xml: string, expected: Money) {
  const currency = dpoField(xml, "TransactionCurrency");
  const amount = dpoField(xml, "TransactionAmount");
  if (currency && currency.toUpperCase() !== expected.currency) return false;
  if (!amount) return true;
  try {
    return parseMoney(amount, expected.currency) === expected.amountMinor;
  } catch {
    return false;
  }
}
