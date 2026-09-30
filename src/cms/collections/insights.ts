import type { CollectionConfig, Field } from "payload";
import { catalogue } from "../blocks";
import { image, richText, text, textarea } from "../fields";
import { DEFAULT_LOCALE } from "../locales";
import { richTextStrings } from "../no-prices";
import { auditPublished, editorsWriteDrafts, publishingAccess } from "../publishing";
import { INSIGHT_TOPICS } from "../topics";

/**
 * Insights: short articles at /<market>/insights/<address>. The newest
 * three show in an insights strip; each ends with its related product.
 * Editors save drafts; only Publishers publish, schedule, restore and delete.
 */

/** Minutes to read, at 200 words a minute, never less than one. */
export function readingMinutes(body: unknown): number {
  const words = richTextStrings(body).join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export const insightPath = (slug: string | null | undefined) => `/insights/${slug ?? ""}`;

const previewUrl = (slug: string | null | undefined, locale: string | undefined) => `/preview?path=${encodeURIComponent(`/${locale || DEFAULT_LOCALE}${insightPath(slug)}`)}`;

export const Insights: CollectionConfig = {
  slug: "insights",
  labels: { singular: "Insight", plural: "Insights" },
  admin: {
    useAsTitle: "title",
    group: "Website",
    defaultColumns: ["title", "topic", "_status", "publishedAt"],
    description: "Articles for the Insights strip and page. Each market's version is a language in the switcher at the top; a market without its own words shows Botswana's.",
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
  defaultSort: "-publishedAt",
  fields: [
    { ...text("title", { required: true, maxLength: 100 }), localized: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: { position: "sidebar", description: "The article's address: /<market>/insights/<address>, e.g. tested-backups." },
      validate: (value: unknown) => (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(value ?? "")) ? true : "Lower-case letters, numbers and single dashes, e.g. tested-backups."),
    },
    { name: "topic", type: "select", required: true, options: [...INSIGHT_TOPICS], admin: { position: "sidebar" } },
    {
      name: "publishedAt",
      label: "Published on",
      type: "date",
      index: true,
      admin: { position: "sidebar", description: "Set on the first publish. Newest first in the Insights strip." },
    },
    {
      name: "readingMinutes",
      label: "Minutes to read",
      type: "number",
      admin: { position: "sidebar", readOnly: true, description: "Worked out from the article's length." },
    },
    { ...textarea("summary", { required: true, maxLength: 240, description: "One or two sentences for the Insights strip and search results." }), localized: true },
    { ...image("image", { label: "Picture (also shown when the article is shared)" }) },
    { ...richText("body", { required: true }), localized: true } as Field,
    { ...catalogue("related", "Related product"), admin: { description: "The product the article ends with. Tick one product.", components: { Field: "@/cms/components/catalogue-picker#CataloguePicker" } } } as Field,
    {
      name: "seo",
      label: "Search and sharing",
      type: "group",
      localized: true,
      fields: [text("title", { label: "Search title", maxLength: 70 }), textarea("description", { label: "Search description", maxLength: 170 })],
    },
  ],
  hooks: {
    beforeOperation: [editorsWriteDrafts],
    beforeChange: [
      ({ data, originalDoc }) => {
        if (data.body !== undefined) data.readingMinutes = readingMinutes(data.body);
        if (data._status === "published" && !data.publishedAt && !originalDoc?.publishedAt) data.publishedAt = new Date().toISOString();
        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, operation }) => {
        if (doc._status !== "published") return doc;
        const first = operation === "create" || previousDoc?._status !== "published";
        await auditPublished(req, "website.insight-published", `${first ? "Published" : "Published changes to"} the insight ${doc.title}`, { insightId: doc.id, slug: doc.slug });
        return doc;
      },
    ],
    afterOperation: [
      async ({ operation, result, req }) => {
        if (operation !== "restoreVersion") return result;
        const { websiteAudit } = await import("@/server/cms/audit");
        const doc = result as { id: string | number; title?: string; slug?: string };
        await websiteAudit(req.user as never, "website.insight-restored", `Restored an earlier version of the insight ${doc.title}`, { insightId: doc.id, slug: doc.slug });
        return result;
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const { websiteAudit } = await import("@/server/cms/audit");
        await websiteAudit(req.user as never, "website.insight-removed", `Removed the insight ${doc.title}`, { insightId: doc.id, slug: doc.slug });
      },
    ],
  },
};
