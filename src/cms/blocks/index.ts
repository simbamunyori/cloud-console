import type { Block, Field } from "payload";
import { heading, icon, image, link, richText, text, textarea, tone } from "../fields";
import { TOKENS_HELP } from "../tokens";

/**
 * The page blocks. Each is one section of a page, drawn with the brand's
 * own components (src/components/site/blocks). Editors choose words,
 * images, icons, links and a section style; the layout is the brand's.
 */

/** Which products a block shows live prices for. Chosen from the catalogue, never typed. */
export const catalogue = (name = "catalogue", label = "Products"): Field => ({
  name,
  label,
  type: "json",
  admin: {
    description: "Tick categories or single products. The lowest live price among them shows in each market.",
    components: { Field: "@/cms/components/catalogue-picker#CataloguePicker" },
  },
});

/** A picture: one of the site's own screenshots, or an uploaded image. */
const picture: Field = {
  name: "picture",
  type: "group",
  fields: [
    {
      name: "source",
      label: "Picture",
      type: "select",
      defaultValue: "upload",
      required: true,
      options: [
        { label: "An image from the media library", value: "upload" },
        { label: "Screenshot: the Cloud Console home page", value: "console-home" },
        { label: "Screenshot: a monthly invoice", value: "console-invoice" },
        { label: "Drawing: Thebe's payments to approve", value: "thebe-approvals" },
      ],
    },
    { ...image("image"), admin: { condition: (_, s) => s?.source === "upload" } } as Field,
    text("caption", { maxLength: 160 }),
  ],
};

const item = (o: { withIcon?: boolean } = {}): Field[] => [
  ...(o.withIcon ? [icon] : []),
  text("title", { required: true, maxLength: 80 }),
  textarea("body", { maxLength: 300 }),
];

export const Hero: Block = {
  slug: "hero",
  labels: { singular: "Hero", plural: "Heroes" },
  interfaceName: "HeroBlock",
  fields: [
    text("kicker", { label: "Small heading above", maxLength: 60 }),
    text("heading", { required: true, maxLength: 80, description: "The page's main heading. Keep it short." }),
    textarea("sub", { label: "Introduction", maxLength: 300 }),
    link("primary", "Main button"),
    link("secondary", "Second button"),
    { name: "supporting", label: "Short points with ticks", type: "array", maxRows: 4, fields: [text("text", { required: true, maxLength: 60 })] },
    picture,
    { name: "domainSearch", label: "Show the domain search under the hero", type: "checkbox", defaultValue: false },
  ],
};

export const DomainSearch: Block = {
  slug: "domainSearch",
  labels: { singular: "Domain search", plural: "Domain searches" },
  interfaceName: "DomainSearchBlock",
  fields: [text("heading", { maxLength: 60 }), text("intro", { maxLength: 160 })],
};

export const FeatureCards: Block = {
  slug: "featureCards",
  labels: { singular: "Feature cards", plural: "Feature cards" },
  interfaceName: "FeatureCardsBlock",
  fields: [
    ...heading(),
    tone,
    {
      name: "style",
      label: "Card style",
      type: "select",
      defaultValue: "raised",
      required: true,
      options: [
        { label: "Raised, icon in a badge", value: "raised" },
        { label: "Flat, plain icon", value: "flat" },
      ],
    },
    { name: "items", label: "Cards", type: "array", minRows: 1, maxRows: 8, fields: item({ withIcon: true }) },
  ],
};

export const ServicesGrid: Block = {
  slug: "servicesGrid",
  labels: { singular: "Services with prices", plural: "Services with prices" },
  interfaceName: "ServicesGridBlock",
  fields: [
    ...heading(),
    tone,
    { name: "anchor", type: "text", admin: { description: "Optional. Lets a link jump here, e.g. services for /bw#services." }, validate: (v: unknown) => (!v || /^[a-z][a-z0-9-]*$/.test(String(v)) ? true : "Lower-case letters, numbers and dashes.") },
    { name: "showTaxNote", label: "Say whether prices include tax", type: "checkbox", defaultValue: true },
    {
      name: "cards",
      type: "array",
      minRows: 1,
      maxRows: 9,
      fields: [
        ...item({ withIcon: true }),
        textarea("note", { label: "Extra line", maxLength: 200 }),
        { name: "dataCentre", label: "Add the own data centre line in markets that have one", type: "checkbox", defaultValue: false },
        catalogue("products", "Price from"),
      ],
    },
    link("more", "Link under the cards"),
  ],
};

export const Pricing: Block = {
  slug: "pricing",
  labels: { singular: "Live prices", plural: "Live prices" },
  interfaceName: "PricingBlock",
  fields: [...heading(), tone, catalogue("products", "Products to list"), link("more", "Link under the prices")],
};

export const Text: Block = {
  slug: "text",
  labels: { singular: "Text", plural: "Text" },
  interfaceName: "TextBlock",
  fields: [text("heading", { maxLength: 140 }), { ...richText("body", { required: true }), admin: { description: TOKENS_HELP } } as Field, tone],
};

export const ImageText: Block = {
  slug: "imageText",
  labels: { singular: "Picture and text", plural: "Pictures and text" },
  interfaceName: "ImageTextBlock",
  fields: [
    ...heading(),
    tone,
    { name: "points", type: "array", maxRows: 6, fields: item({ withIcon: true }) },
    picture,
    {
      name: "pictureSide",
      type: "select",
      defaultValue: "right",
      required: true,
      options: [
        { label: "Picture on the right", value: "right" },
        { label: "Picture on the left", value: "left" },
      ],
    },
    {
      name: "card",
      label: "Card under the picture",
      type: "group",
      admin: { description: "Optional. Puts the picture in a card with a title, a line and a link." },
      fields: [text("kicker", { label: "Small heading above", maxLength: 60 }), text("title", { maxLength: 80 }), textarea("body", { maxLength: 400 }), link("link", "Link")],
    },
  ],
};

export const Faq: Block = {
  slug: "faq",
  labels: { singular: "Questions and answers", plural: "Questions and answers" },
  interfaceName: "FaqBlock",
  fields: [...heading(), tone, { name: "items", type: "array", minRows: 1, fields: [text("question", { required: true, maxLength: 160 }), richText("answer", { required: true })] }],
};

export const Testimonials: Block = {
  slug: "testimonials",
  labels: { singular: "Customer quotes", plural: "Customer quotes" },
  interfaceName: "TestimonialsBlock",
  fields: [
    text("heading", { maxLength: 80, description: "Hidden from view (read by screen readers) when left empty." }),
    tone,
    {
      name: "items",
      label: "Quotes",
      type: "array",
      admin: { description: "Real customers only, with their permission. The section stays hidden while there are none." },
      fields: [textarea("quote", { required: true, maxLength: 400 }), text("name", { required: true, maxLength: 80 }), text("role", { maxLength: 80 })],
    },
  ],
};

export const LogoStrip: Block = {
  slug: "logoStrip",
  labels: { singular: "Logos", plural: "Logos" },
  interfaceName: "LogoStripBlock",
  fields: [text("heading", { maxLength: 80 }), tone, { name: "logos", type: "array", minRows: 1, maxRows: 12, fields: [text("name", { required: true, maxLength: 60 }), image("image", { required: true })] }],
};

export const CallToAction: Block = {
  slug: "callToAction",
  labels: { singular: "Call to action", plural: "Calls to action" },
  interfaceName: "CallToActionBlock",
  fields: [text("heading", { required: true, maxLength: 140 }), textarea("body", { maxLength: 300 }), tone, link("primary", "Main button"), link("secondary", "Second button")],
};

export const PageIntro: Block = {
  slug: "pageIntro",
  labels: { singular: "Page heading", plural: "Page headings" },
  interfaceName: "PageIntroBlock",
  fields: [
    text("kicker", { label: "Small heading above", maxLength: 60 }),
    text("heading", { required: true, maxLength: 120, description: "The page's main heading." }),
    textarea("intro", { label: "Introduction", maxLength: 400 }),
    { name: "showTaxNote", label: "Say whether prices include tax", type: "checkbox", defaultValue: false },
  ],
};

export const AssistantNotice: Block = {
  slug: "assistantNotice",
  labels: { singular: "Assistant notice", plural: "Assistant notices" },
  interfaceName: "AssistantNoticeBlock",
  admin: { disableBlockName: true },
  fields: [
    text("heading", { required: true, maxLength: 80, description: "The notice itself is a fixed product fact: what the support assistant is sent, and where the AI service runs." }),
  ],
};

export const PAGE_BLOCKS: Block[] = [PageIntro, Hero, DomainSearch, FeatureCards, ServicesGrid, Pricing, Text, ImageText, Faq, Testimonials, LogoStrip, CallToAction, AssistantNotice];
