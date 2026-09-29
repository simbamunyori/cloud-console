import type { Field, TextareaField, TextField } from "payload";
import { noPrices, PRICE_MESSAGE, looksLikePrice, richTextStrings } from "../no-prices";
import { ICON_NAMES } from "../icons";

/**
 * Field builders for the page blocks. Every text field refuses prices, and
 * the only design choices offered are the ones below: a section's tone,
 * an icon from the brand's set, and where a button goes. There are no
 * colour, font, spacing or code fields.
 */

type TextOptions = { label?: string; required?: boolean; description?: string; localized?: boolean; maxLength?: number };

export function text(name: string, o: TextOptions = {}): TextField {
  return {
    name,
    type: "text",
    label: o.label,
    required: o.required,
    maxLength: o.maxLength,
    admin: o.description ? { description: o.description } : undefined,
    validate: (value: unknown) => noPrices(value, o),
  } as TextField;
}

export function textarea(name: string, o: TextOptions = {}): TextareaField {
  return {
    name,
    type: "textarea",
    label: o.label,
    required: o.required,
    maxLength: o.maxLength,
    admin: o.description ? { description: o.description } : undefined,
    validate: (value: unknown) => noPrices(value, o),
  } as TextareaField;
}

/** Rich text: headings, bold, italic, links and lists (the editor's features, in payload.config.ts). No prices. */
export function richText(name: string, o: { label?: string; required?: boolean } = {}): Field {
  return {
    name,
    type: "richText",
    label: o.label,
    required: o.required,
    validate: (value: unknown) => (richTextStrings(value).some(looksLikePrice) ? PRICE_MESSAGE : true),
  } as Field;
}

/** Light or dark, from the brand's own section styles. */
export const tone: Field = {
  name: "tone",
  type: "select",
  label: "Section style",
  defaultValue: "plain",
  required: true,
  options: [
    { label: "Plain", value: "plain" },
    { label: "Light panel", value: "light" },
    { label: "Dark (navy)", value: "dark" },
  ],
};

export const icon: Field = {
  name: "icon",
  type: "select",
  required: true,
  options: ICON_NAMES.map((n) => ({ label: n.label, value: n.value })),
};

/** The words above a section's heading, its heading and a short introduction. */
export const heading = (o: { required?: boolean } = { required: true }): Field[] => [
  text("kicker", { label: "Small heading above", maxLength: 60 }),
  text("heading", { required: o.required, maxLength: 140 }),
  textarea("intro", { label: "Introduction", maxLength: 400 }),
];

/** A button or link: its words and where it goes. Only this site and the market's own support email. */
export function link(name: string, label: string, o: { required?: boolean } = {}): Field {
  return {
    name,
    label,
    type: "group",
    fields: [
      text("label", { label: "Words on the button", required: o.required, maxLength: 40 }),
      {
        name: "to",
        label: "Goes to",
        type: "select",
        defaultValue: "market",
        options: [
          { label: "A page in this market (e.g. /pricing)", value: "market" },
          { label: "A page anywhere on this site (e.g. /sign-up)", value: "site" },
          { label: "An email to the market's support address", value: "email" },
        ],
      },
      {
        name: "path",
        type: "text",
        label: "Page",
        admin: { condition: (_, s) => s?.to !== "email", description: "Starts with /. For this market's pricing page: /pricing" },
        validate: (value: unknown, { siblingData }: { siblingData?: { label?: string; to?: string } }) => {
          if (!siblingData?.label || siblingData.to === "email") return true;
          return typeof value === "string" && /^\/[\w\-./#?=&%]*$/.test(value) && !value.startsWith("//") ? true : "Enter a page on this site, starting with /.";
        },
      },
      text("subject", { label: "Email subject", maxLength: 80 }),
    ],
  };
}

export const image = (name = "image", o: { required?: boolean; label?: string } = {}): Field => ({
  name,
  label: o.label,
  type: "upload",
  relationTo: "media",
  required: o.required,
});
