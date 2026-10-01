/** Insight topics, for the Insights collection and the insights strip. */
export const INSIGHT_TOPICS = [
  { label: "Resilience", value: "resilience" },
  { label: "Compliance", value: "compliance" },
  { label: "Email security", value: "email-security" },
  { label: "Productivity", value: "productivity" },
  { label: "Security", value: "security" },
  { label: "Websites", value: "websites" },
] as const;

export const topicLabel = (value: string | null | undefined) => INSIGHT_TOPICS.find((t) => t.value === value)?.label ?? null;

/** Help centre sections, in the order the help centre lists them. */
export const HELP_SECTIONS = [
  { label: "Getting started", value: "getting-started" },
  { label: "Domains", value: "domains" },
  { label: "Email and Microsoft 365", value: "email" },
  { label: "Websites", value: "websites" },
  { label: "Security", value: "security" },
  { label: "Hosting and backup", value: "hosting" },
  { label: "Billing and payments", value: "billing" },
  { label: "Your account", value: "account" },
] as const;

export const helpSectionLabel = (value: string | null | undefined) => HELP_SECTIONS.find((t) => t.value === value)?.label ?? null;
