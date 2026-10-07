import { times, type Money } from "@/lib/domain/money";

/**
 * The Microsoft 365 and Google Workspace cost calculator (final build,
 * Milestone 8): how many people and what they need in, a recommended plan
 * and its monthly total out, at this month's price book prices. A plan
 * not on sale in the market is never recommended.
 */

export type Provider = "microsoft" | "google" | "either";
export type Need = "desktop" | "meetings" | "storage" | "security" | "archive";

export const NEEDS: { key: Need; label: string; hint: string }[] = [
  { key: "desktop", label: "Word, Excel and Outlook installed on computers", hint: "Not just in the browser." },
  { key: "meetings", label: "Recorded meetings and webinars", hint: "Record calls, or run webinars and booking pages." },
  { key: "storage", label: "Lots of storage per person", hint: "More than 1 TB each, or shared drives for teams." },
  { key: "security", label: "Device management and advanced security", hint: "Manage laptops and phones, block risky sign-ins." },
  { key: "archive", label: "Keep and search all email for legal or compliance reasons", hint: "Retention and eDiscovery." },
];

/** Microsoft 365 Business and Google Workspace Business plans take up to 300 people. */
export const MAX_USERS = 300;

interface PlanSpec {
  slug: string;
  provider: "microsoft" | "google";
  meets: Need[];
}

/** Cheapest first within each provider. */
export const PLANS: PlanSpec[] = [
  { slug: "microsoft-365-business-basic", provider: "microsoft", meets: [] },
  { slug: "microsoft-365-business-standard", provider: "microsoft", meets: ["desktop", "meetings", "storage"] },
  { slug: "microsoft-365-business-premium", provider: "microsoft", meets: ["desktop", "meetings", "storage", "security", "archive"] },
  { slug: "google-workspace-business-starter", provider: "google", meets: [] },
  { slug: "google-workspace-business-standard", provider: "google", meets: ["meetings", "storage"] },
  { slug: "google-workspace-business-plus", provider: "google", meets: ["meetings", "storage", "security", "archive"] },
];

export interface PricedPlan {
  slug: string;
  name: string;
  /** Per person per month, as the market shows prices. */
  unit: Money;
  total: Money;
  provider: "microsoft" | "google";
  /** Products the plan includes at no extra charge (STRATEGY_ROLLOUT U3). */
  included: string[];
}

export interface Estimate {
  users: number;
  plan: PricedPlan | null;
  alternative: PricedPlan | null;
  /** Why this plan, in a sentence. */
  why: string;
  /** Set when nothing on sale fits: what to do instead. */
  note: string | null;
}

export function parseUsers(v: unknown): number | null {
  const n = Number(typeof v === "string" ? v.trim() : v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : null;
}

export function parseNeeds(values: unknown[]): Need[] {
  const keys = new Set(NEEDS.map((n) => n.key));
  return [...new Set(values.filter((v): v is Need => typeof v === "string" && keys.has(v as Need)))];
}

export function estimate(input: { users: number; provider: Provider; needs: Need[] }, prices: { slug: string; name: string; price: Money; included?: string[] }[]): Estimate {
  const priced = (spec: PlanSpec): PricedPlan | null => {
    const p = prices.find((x) => x.slug === spec.slug);
    return p ? { slug: p.slug, name: p.name, unit: p.price, total: times(p.price, input.users), provider: spec.provider, included: p.included ?? [] } : null;
  };
  const fits = (spec: PlanSpec) => input.needs.every((n) => spec.meets.includes(n));
  const best = (provider: "microsoft" | "google") => {
    const spec = PLANS.find((p) => p.provider === provider && fits(p) && priced(p));
    return spec ? priced(spec) : null;
  };
  const ms = input.provider === "google" ? null : best("microsoft");
  const gw = input.provider === "microsoft" ? null : best("google");
  const options = [ms, gw].filter((p): p is PricedPlan => Boolean(p)).sort((a, b) => (a.unit.amountMinor < b.unit.amountMinor ? -1 : a.unit.amountMinor > b.unit.amountMinor ? 1 : 0));
  const plan = options[0] ?? null;
  const alternative = options[1] ?? null;
  const wanted = NEEDS.filter((n) => input.needs.includes(n.key)).map((n) => n.label.toLowerCase());

  if (input.users > MAX_USERS) {
    return { users: input.users, plan: null, alternative: null, why: "", note: `Business plans take up to ${MAX_USERS} people. For more, ask us for a quote and we'll price an Enterprise plan.` };
  }
  if (!plan) {
    const why =
      input.needs.includes("desktop") && input.provider === "google"
        ? "Google Workspace has no installed Office apps. Choose Microsoft 365, or either."
        : "No plan on sale here covers everything you ticked.";
    return { users: input.users, plan: null, alternative: null, why: "", note: `${why} Ask us for a quote and we'll suggest the right mix.` };
  }
  return {
    users: input.users,
    plan,
    alternative,
    why: wanted.length ? `The lowest-priced plan that covers ${wanted.join(", ")}.` : "The lowest-priced plan for business email on your own domain, with video calls and documents.",
    note: null,
  };
}

export const PROVIDER_LABEL: Record<Provider, string> = { microsoft: "Microsoft 365", google: "Google Workspace", either: "Either" };
