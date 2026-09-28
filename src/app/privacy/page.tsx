import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { chooseMarket, MARKET_COOKIE } from "@/lib/domain/markets";
import { requestCountry } from "@/server/markets/geo";
import { enabledMarkets } from "@/server/site/site";

/** The Phase 1 privacy page moved to each market's legal pages. Old links land on the visitor's own. */
export default async function PrivacyRedirect() {
  const cookie = (await cookies()).get(MARKET_COOKIE)?.value;
  const { market } = chooseMarket(await enabledMarkets(), { cookie, country: cookie ? undefined : await requestCountry() });
  redirect(`/${market.code}/legal/privacy`);
}
