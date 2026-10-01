import type { Field, GlobalConfig } from "payload";
import { link, text } from "../fields";
import { MARKET_LOCALES } from "../locales";
import { isPublisher } from "../publishing";

/**
 * A one-line announcement above the top strip on every public page,
 * shown only between its start and end (docs/FINAL_BUILD.md, Milestone 4).
 * It goes live as soon as it is saved, so only Publishers may change it.
 */
export const Announcement: GlobalConfig = {
  slug: "announcement",
  label: "Announcement bar",
  admin: { group: "Proof", description: "One line above the top of every public page, between the start and end below. Leave the text empty for none." },
  access: { read: () => true, update: ({ req }) => isPublisher(req) },
  fields: [
    text("text", { maxLength: 140, description: "e.g. Our offices are closed on 30 September. Urgent issues are still watched around the clock." }),
    link("link", "Link"),
    { name: "startsAt", label: "Start", type: "date", admin: { date: { pickerAppearance: "dayAndTime" }, description: "Empty shows it straight away." } },
    { name: "endsAt", label: "End", type: "date", admin: { date: { pickerAppearance: "dayAndTime" }, description: "Empty keeps it up until it is removed." } },
    {
      name: "markets",
      type: "select",
      hasMany: true,
      options: MARKET_LOCALES.map((l) => ({ label: l.label, value: l.code })),
      admin: { description: "Leave empty to show it in every market." },
    } as Field,
  ],
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user as never, "website.announcement-changed", doc.text ? `Set the announcement bar: ${doc.text}` : "Cleared the announcement bar", {
          startsAt: doc.startsAt,
          endsAt: doc.endsAt,
        });
        return doc;
      },
    ],
  },
};
