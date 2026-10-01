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
