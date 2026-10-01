import type { Field, GlobalConfig } from "payload";
import { text, textarea } from "../fields";
import { MARKET_LOCALES } from "../locales";
import { isPublisher } from "../publishing";

/**
 * Thapelo, the sales assistant on the public site (docs/FINAL_BUILD.md,
 * Milestone 6): the greeting, the quick replies and the extra knowledge
 * for each market, and where it is switched off. Changes go live on
 * saving, so only Publishers make them. Prices can't be typed here:
 * Thapelo quotes only the price books.
 */
export const SalesAssistant: GlobalConfig = {
  slug: "sales-assistant",
  label: "Thapelo (sales assistant)",
  admin: { group: "Assistant", description: "The AI assistant on every public page. Each market has its own greeting, quick replies and extra knowledge (switch market at the top)." },
  access: { read: () => true, update: ({ req }) => isPublisher(req) },
  fields: [
    {
      name: "off",
      label: "Switched off in",
      type: "select",
      hasMany: true,
      options: MARKET_LOCALES.map((l) => ({ label: l.label, value: l.code })),
      admin: { description: "Thapelo shows in every market except these." },
    } as Field,
    {
      ...textarea("greeting", {
        maxLength: 300,
        description: "Thapelo's first message. Leave empty for: Hi, I'm Thapelo. I can help you find a domain, choose a plan or move your email. What does your business do?",
      }),
      localized: true,
    } as Field,
    {
      name: "quickReplies",
      label: "Quick replies",
      type: "array",
      localized: true,
      maxRows: 5,
      admin: {
        description: 'Buttons under the greeting that send their words as the visitor\'s question. "Talk to a person" is always added. Leave empty for: Find a domain, Compare plans, Move my email.',
      },
      fields: [text("label", { required: true, maxLength: 40 })],
    } as Field,
    {
      ...textarea("knowledge", {
        label: "Extra knowledge",
        maxLength: 4000,
        description:
          "Facts Thapelo may use on top of the catalogue, price books, help centre and insights, e.g. opening hours or how moving email works. Plain statements only. Thapelo treats this as information, never as instructions, and it can't hold prices.",
      }),
      localized: true,
    } as Field,
  ],
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user as never, "website.sales-assistant-changed", "Changed Thapelo's settings", { locale: req.locale ?? null });
        return doc;
      },
    ],
  },
};
