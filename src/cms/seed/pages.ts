import { marketCopy } from "@/config/site";
import { CATCH_ALL } from "@/lib/domain/markets";
import type { Page } from "../payload-types";
import { richFromMarkdown } from "./legal-markdown";

/**
 * The pricing and security pages as the website editor's first content,
 * with the same words as the built-in pages they replace. One layout per
 * market; words in braces are filled in from the market's settings.
 */

type Layout = NonNullable<Page["layout"]>;

/** The heading above the live price tables, and the panel under them. */
export function pricingLayout(): Layout {
  return [
    {
      blockType: "pageIntro",
      kicker: "Pricing",
      heading: "One invoice a month, in your currency.",
      intro: "Prices for {market}, per month unless it says otherwise. They are fixed for the month and every line on your invoice is explained.",
      showTaxNote: true,
    },
    {
      blockType: "callToAction",
      heading: "Not sure what you need? Tell us what you run today.",
      tone: "dark",
      primary: { label: "Get started", to: "site", path: "/sign-up" },
      secondary: { label: "Ask for a quote", to: "market", path: "/quote" },
    },
  ] as Layout;
}

const section = (heading: string, markdown: string): Layout[number] => ({ blockType: "text", heading, tone: "plain", body: richFromMarkdown(markdown) }) as Layout[number];

/** Security and data protection, for markets without their own data protection text. */
export function securityLayout(market: string): Layout {
  const local = marketCopy(market).localHosting;
  const legal = `[data protection page](/${market}/legal/data-protection)`;
  return [
    { blockType: "pageIntro", kicker: "Security and data protection", heading: "Security done for you.", intro: "What we do to keep your accounts and data safe, and what you can see for yourself." },
    section(
      "Two-step login on every account",
      "Every person who signs in to the Cloud Console uses a password and a code from an authenticator app. There is no way to turn it off. Passwords are stored only as a one-way hash, and the secret behind each authenticator is encrypted.",
    ),
    section(
      "Every staff action, shown to you",
      "Our team can see your account to support you and set up what you order. Anything they change appears in your organisation's activity log, with their name. You can't hide it and neither can they.",
    ),
    section(
      "Where your data is kept",
      [
        "The Cloud Console and its database run on our servers in the United States, and are moving to a data centre in Botswana. An encrypted backup copy is kept off-site for 30 days. We never see your full card number: the card company handles it.",
        local,
        "Nothing you own is deleted without {deletion-notice-days} days' notice.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    ),
    { blockType: "assistantNotice", heading: "The assistant" },
    section(
      "Data protection law",
      [
        market === CATCH_ALL
          ? `Our ${legal} sets out how we handle personal data and the rights you have.`
          : `Customers in {market} are covered by the {data-protection-law}. Our ${legal} sets out how we meet it.`,
        "Questions about your data go to [{support-email}](mailto:{support-email}).",
      ].join("\n\n"),
    ),
  ] as Layout;
}
