import type { BrowserContext } from "@playwright/test";
import type { Audience } from "./pages";
import { DEMO_CUSTOMER, DEMO_STAFF, testSession } from "./sessions";

const cache = new Map<Audience, Promise<{ name: string; value: string }>>();

/** Signs a browser context in as the demo customer or staff member. Public pages stay signed out. */
export async function signIn(context: BrowserContext, audience: Audience, base: string) {
  if (audience === "public") return;
  if (!cache.has(audience)) cache.set(audience, testSession(audience === "staff" ? DEMO_STAFF : DEMO_CUSTOMER));
  await context.addCookies([{ ...(await cache.get(audience)!), url: base }]);
}
