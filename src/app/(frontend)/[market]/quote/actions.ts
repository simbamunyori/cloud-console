"use server";

import type { QuoteRequestState } from "@/components/quotes/request-form";
import { field } from "@/server/action-state";
import { takeQuoteRequest } from "@/server/quotes/request-action";
import { siteMarket } from "@/server/site/site";

/** From the public site: no account needed. */
export async function requestQuoteAction(_prev: QuoteRequestState, form: FormData): Promise<QuoteRequestState> {
  const market = await siteMarket(field(form, "market"));
  return takeQuoteRequest(form, { market: market.code });
}
