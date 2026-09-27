import Link from "next/link";
import { staffSignOutAction } from "@/app/(auth)/actions";
import { MobileNav } from "@/components/app/mobile-nav";
import { SidebarNav, type NavItem } from "@/components/app/sidebar-nav";
import { UserCard } from "@/components/app/user-card";
import { Badge } from "@/components/ui/badge";
import { Logo, LogoMark } from "@/components/ui/logo";
import { requireStaff } from "@/server/admin/context";
import { staffOverview } from "@/server/admin/customers";
import { prisma } from "@/server/db";
import { STAFF_ROLE_LABEL, staffCan, type StaffPermission } from "@/server/staff/access";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { staff } = await requireStaff();
  const counts = await staffOverview(prisma);
  const all: (NavItem & { needs: StaffPermission })[] = [
    { href: "/admin", label: "Overview", icon: "overview", exact: true, needs: "viewCustomers" },
    { href: "/admin/customers", label: "Customers", icon: "customers", needs: "viewCustomers" },
    { href: "/admin/tasks", label: "Setup queue", icon: "tasks", needs: "viewCustomers", badge: counts.openTasks || undefined },
    { href: "/admin/tickets", label: "Tickets", icon: "support", needs: "viewCustomers", badge: counts.tickets || undefined },
    { href: "/admin/orders", label: "Orders", icon: "orders", needs: "viewCustomers" },
    { href: "/admin/payments", label: "EFT payments", icon: "payments", needs: "confirmPayments", badge: counts.eft || undefined },
    { href: "/admin/pricing", label: "Pricing", icon: "pricing", needs: "managePricing" },
    { href: "/admin/markets", label: "Markets", icon: "markets", needs: "manageMarkets" },
    { href: "/admin/waitlist", label: "Waiting list", icon: "waitlist", needs: "viewCustomers", badge: counts.waitlist || undefined },
  ];
  const nav: NavItem[] = all.filter((i) => staffCan(staff, i.needs)).map(({ needs: _needs, ...i }) => i);
  const user = <UserCard name={staff.name} role={`${STAFF_ROLE_LABEL[staff.staffRole]} staff`} signOut={staffSignOutAction} />;

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-1 focus:px-4 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-surface-1 px-4 py-6 lg:flex">
        <Link href="/admin" className="flex flex-col items-start gap-2 self-start rounded-sm px-2">
          <Logo />
          <Badge tone="warning">Staff console</Badge>
        </Link>
        <SidebarNav items={nav} />
        <div className="mt-auto">{user}</div>
      </aside>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface-1 px-4 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2 rounded-sm">
          <LogoMark size={32} />
          <Badge tone="warning">Staff</Badge>
        </Link>
        <MobileNav items={nav} header={<LogoMark size={32} />} footer={user} />
      </header>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-content">{children}</div>
      </main>
    </div>
  );
}
