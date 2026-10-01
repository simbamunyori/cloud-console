import type { CollectionConfig, Field } from "payload";
import { richText, text, textarea } from "../fields";
import { DEFAULT_LOCALE } from "../locales";
import { auditPublished, editorsWriteDrafts, publishingAccess } from "../publishing";
import { HELP_SECTIONS } from "../topics";

/**
 * Help centre articles at /<market>/help/<address>. Links to the help
 * centre (FAQ, footer, menus) stay hidden until the market has one
 * published article. Editors save drafts; only Publishers publish.
 */

export const helpPath = (slug?: string | null) => (slug ? `/help/${slug}` : "/help");

const previewUrl = (slug: string | null | undefined, locale: string | undefined) => `/preview?path=${encodeURIComponent(`/${locale || DEFAULT_LOCALE}${helpPath(slug)}`)}`;

export const Help: CollectionConfig = {
  slug: "help",
  labels: { singular: "Help article", plural: "Help centre" },
  admin: {
    useAsTitle: "title",
    group: "Website",
    defaultColumns: ["title", "section", "_status", "updatedAt"],
    description: "Answers for customers, grouped by section. Each market's version is a language in the switcher at the top; a market without its own words shows Botswana's.",
    livePreview: {
      url: ({ data, locale }) => previewUrl(data?.slug, locale?.code),
      breakpoints: [
        { label: "Phone", name: "phone", width: 390, height: 844 },
        { label: "Desktop", name: "desktop", width: 1440, height: 900 },
      ],
    },
    preview: (doc, { locale }) => previewUrl(doc?.slug as string, locale),
  },
  access: publishingAccess,
  versions: { drafts: { autosave: { interval: 1500 }, schedulePublish: true }, maxPerDoc: 50 },
  defaultSort: "order",
  fields: [
    { ...text("title", { required: true, maxLength: 120, description: "A question or task, e.g. How do I move my email to Microsoft 365?" }), localized: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { position: "sidebar", description: "The article's address: /<market>/help/<address>, e.g. move-your-email." },
      validate: (value: unknown) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(value ?? "")) ? true : "Lower-case letters, numbers and single dashes, e.g. move-your-email."),
    },
    { name: "section", type: "select", required: true, options: [...HELP_SECTIONS], admin: { position: "sidebar" } },
    { name: "order", type: "number", defaultValue: 100, admin: { position: "sidebar", description: "Lower numbers come first in their section." } },
    { ...textarea("summary", { required: true, maxLength: 200, description: "One sentence for the help centre's list and search results." }), localized: true },
    { ...richText("body", { required: true }), localized: true } as Field,
  ],
  hooks: {
    beforeOperation: [editorsWriteDrafts],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        if (doc._status !== "published") return doc;
        const first = operation === "create" || previousDoc?._status !== "published";
        await auditPublished(req, "website.help-published", `${first ? "Published" : "Published changes to"} the help article ${doc.title}`, { helpId: doc.id, slug: doc.slug });
        return doc;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user as never, "website.help-removed", `Removed the help article ${doc.title}`, { helpId: doc.id, slug: doc.slug });
      },
    ],
  },
};
