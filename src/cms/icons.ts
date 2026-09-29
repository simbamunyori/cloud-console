/** The icons a block may use: the brand's line icons (lucide), by name. */
export const ICON_NAMES = [
  { value: "users", label: "People" },
  { value: "credit-card", label: "Card" },
  { value: "life-buoy", label: "Support" },
  { value: "shield-check", label: "Shield" },
  { value: "mail", label: "Email" },
  { value: "server", label: "Server" },
  { value: "lock", label: "Lock" },
  { value: "hard-drive", label: "Backup" },
  { value: "layout-grid", label: "Websites" },
  { value: "boxes", label: "Applications" },
  { value: "sparkles", label: "Assistant" },
  { value: "graduation-cap", label: "Education" },
  { value: "building", label: "Firm" },
  { value: "trending-up", label: "Growth" },
  { value: "handshake", label: "Partners" },
  { value: "globe", label: "Globe" },
  { value: "earth", label: "Earth" },
  { value: "check", label: "Tick" },
  { value: "receipt", label: "Invoice" },
] as const;

export type IconName = (typeof ICON_NAMES)[number]["value"];
