import {
  Boxes,
  Building2,
  Check,
  CreditCard,
  Globe,
  Globe2,
  GraduationCap,
  Handshake,
  HardDrive,
  LayoutGrid,
  LifeBuoy,
  Lock,
  Mail,
  Receipt,
  Server,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/cms/icons";

/** The brand's line icons, by the names the website editor offers. */
export const ICONS: Record<IconName, LucideIcon> = {
  users: Users,
  "credit-card": CreditCard,
  "life-buoy": LifeBuoy,
  "shield-check": ShieldCheck,
  mail: Mail,
  server: Server,
  lock: Lock,
  "hard-drive": HardDrive,
  "layout-grid": LayoutGrid,
  boxes: Boxes,
  sparkles: Sparkles,
  "graduation-cap": GraduationCap,
  building: Building2,
  "trending-up": TrendingUp,
  handshake: Handshake,
  globe: Globe,
  earth: Globe2,
  check: Check,
  receipt: Receipt,
};

export function BlockIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const Icon = ICONS[name as IconName] ?? Boxes;
  return <Icon aria-hidden className={className} />;
}
