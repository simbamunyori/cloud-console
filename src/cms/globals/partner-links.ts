import type { GlobalConfig } from "payload";
import { isPublisher } from "../publishing";

/**
 * Addresses on other websites that staff may change without a deploy
 * (final build, Milestone 8). Empty means the built-in address.
 */
export const PartnerLinks: GlobalConfig = {
  slug: "partner-links",
  label: "Thebe links",
  admin: { group: "Website", description: "Where the Try Thebe buttons go. Changes go live on saving." },
  access: { read: () => true, update: ({ req }) => isPublisher(req) },
  fields: [
    {
      name: "thebeTryUrl",
      label: "Try Thebe address",
      type: "text",
      maxLength: 300,
      admin: { description: "Thebe's sign-up page, once it exists, e.g. https://www.thebe.africa/sign-up. Leave empty for Thebe's website, https://www.thebe.africa." },
      validate: (v: unknown) => (!v || /^https:\/\/[^\s]+$/.test(String(v)) ? true : "Use an address that starts with https://."),
    },
  ],
};
