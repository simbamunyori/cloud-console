"use server";

import { cookies } from "next/headers";
import { requestContext } from "@/server/auth/next";
import { countForCampaign, currentTouch } from "@/server/campaigns/cookie";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { DomainError } from "@/server/org/access";
import { askThapelo, CHAT_KEEP_DAYS, chatHistory, type SalesCard } from "@/server/sales/assistant";
import { siteKnowledge, salesSettings } from "@/server/sales/knowledge";
import { createLead } from "@/server/sales/leads";
import { salesModel } from "@/server/sales/model";
import { enabledMarkets } from "@/server/site/site";

/**
 * The panel's calls. A visitor's chat is found by a random token in an
 * httpOnly cookie, so nobody else can read it; there is no sign-in.
 */

const COOKIE = process.env.NODE_ENV === "production" ? "__Host-console_thapelo" : "console_thapelo";

async function marketOf(code: string) {
  const m = (await enabledMarkets()).find((x) => x.code === code);
  const settings = m ? await salesSettings(m.code) : null;
  return m && settings ? { m, settings } : null;
}

export interface ThapeloReply {
  answer?: string;
  cards?: SalesCard[];
  error?: string;
}

export async function askThapeloAction(market: string, question: string, page: string): Promise<ThapeloReply> {
  const found = await marketOf(market);
  if (!found) return { error: "Thapelo isn't available here." };
  const jar = await cookies();
  try {
    const reply = await askThapelo(
      {
        prisma,
        model: salesModel(),
        market: { code: found.m.code, name: found.m.name },
        settings: found.settings,
        knowledge: siteKnowledge(found.m),
        ipAddress: (await requestContext()).ipAddress ?? null,
      },
      { question: String(question ?? ""), token: jar.get(COOKIE)?.value, page: String(page ?? "") },
    );
    if (reply.token) {
      jar.set(COOKIE, reply.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: CHAT_KEEP_DAYS * 24 * 60 * 60 });
    }
    return { answer: reply.answer, cards: reply.cards };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    throw e;
  }
}

/** The chat so far, when the panel opens on another page. */
export async function thapeloHistoryAction(market: string) {
  return chatHistory(prisma, (await cookies()).get(COOKIE)?.value, market);
}

export interface ContactState {
  error?: string;
  fieldErrors?: Record<string, string>;
  reference?: string;
  /** What was typed, so the form keeps it when it comes back with errors. */
  values?: Record<string, string>;
}

export async function thapeloContactAction(_prev: ContactState, form: FormData): Promise<ContactState> {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  // A field people can't see: only bots fill it in.
  if (get("website")) return { reference: "received" };
  const found = await marketOf(get("market"));
  if (!found) return { error: "This isn't available here." };
  try {
    const { reference } = await createLead(
      prisma,
      found.m,
      {
        name: get("name"),
        email: get("email"),
        phone: get("phone"),
        company: get("company"),
        need: get("need"),
        consent: get("consent") === "yes",
        reason: get("reason") === "follow-up" ? "follow-up" : "person",
      },
      { token: (await cookies()).get(COOKIE)?.value, ipAddress: (await requestContext()).ipAddress ?? null, touch: await currentTouch() },
    );
    await countForCampaign("LEAD", reference);
    await runSoon("email-deliver").catch(() => undefined);
    return { reference };
  } catch (e) {
    if (e instanceof DomainError) {
      const values = Object.fromEntries(["name", "email", "phone", "company", "need"].map((k) => [k, get(k)]));
      return { error: e.fieldErrors ? undefined : e.message, fieldErrors: e.fieldErrors, values };
    }
    throw e;
  }
}
