"use client";

import {
  Activity,
  Boxes,
  ChartColumn,
  Globe,
  Hourglass,
  Building2,
  FileText,
  ClipboardList,
  House,
  KeyRound,
  LayoutDashboard,
  Package,
  Percent,
  LifeBuoy,
  MessagesSquare,
  ReceiptText,
  Server,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  SquarePen,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Icons by name, because components can't be passed from server layouts. */
const ICONS = {
  home: House,
  marketplace: ShoppingBag,
  services: Server,
  billing: ReceiptText,
  spend: ChartColumn,
  support: LifeBuoy,
  team: Users,
  licences: KeyRound,
  security: ShieldCheck,
  settings: SlidersHorizontal,
  customers: Building2,
  tasks: ClipboardList,
  payments: Wallet,
  overview: LayoutDashboard,
  orders: Package,
  pricing: Percent,
  catalogue: Boxes,
  markets: Globe,
  waitlist: Hourglass,
  quotes: FileText,
  leads: MessagesSquare,
  website: SquarePen,
  staff: UserCog,
  status: Activity,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  exact?: boolean;
  /** A count shown beside the label, e.g. items needing attention. */
  badge?: number;
}

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map(({ href, label, icon, exact, badge }) => {
        const Icon = ICONS[icon];
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-md px-3 text-body transition-colors",
              active ? "bg-brand-soft font-semibold text-link" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon aria-hidden className="size-5" strokeWidth={active ? 2 : 1.75} />
            <span className="flex-1">{label}</span>
            {badge ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-caption font-semibold text-on-brand tabular-nums">
                <span className="sr-only">, </span>
                {badge}
                <span className="sr-only"> need attention</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
