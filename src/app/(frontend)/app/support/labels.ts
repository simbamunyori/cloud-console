import type { BadgeTone } from "@/components/ui/badge";

export const TICKET_STATUS: Record<string, [string, BadgeTone]> = {
  OPEN: ["With our team", "info"],
  WAITING_ON_CUSTOMER: ["Replied", "warning"],
  RESOLVED: ["Sorted", "positive"],
};
