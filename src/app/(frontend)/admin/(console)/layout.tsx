import Link from "next/link";
import { staffSignOutAction } from "@/app/(frontend)/(auth)/actions";
import { MobileNav } from "@/components/app/mobile-nav";
import { SidebarNav, type NavItem } from "@/components/app/sidebar-nav";
import { UserCard } from "@/components/app/user-card";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Badge } from "@/components/ui/badge";
import { Logo, LogoMark } from "@/components/ui/logo";
import { requireStaff } from "@/server/admin/context";
import { staffOverview } from "@/server/admin/customers";
import { prisma } from "@/server/db";
import { STAFF_ROLE_LABEL, staffCan, websiteRoleOf, type StaffPermission } from "@/server/staff/access";
import { currentTheme } from "@/server/theme";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { staff, session } = await requireStaff();
  const counts = await staffOverview(prisma);
  const all: (NavItem & { needs: StaffPermission })[] = [
    { href: "/admin", label: "Overview", icon: "overview", exact: true, needs: "viewCustomers" },
    { href: "/admin/customers", label: "Customers", icon: "customers", needs: "viewCustomers" },
    { href: "/admin/tasks", label: "Setup queue", icon: "tasks", needs: "viewCustomers", badge: counts.openTasks || undefined },
    { href: "/admin/tickets", label: "Tickets", icon: "support", needs: "viewCustomers", badge: counts.tickets || undefined },
    { href: "/admin/orders", label: "Orders", icon: "orders", needs: "viewCustomers" },
    { href: "/admin/security-scores", label: "Security scores", icon: "security", needs: "viewCustomers" },
    { href: "/admin/backups", label: "Backups", icon: "backup", needs: "workTasks", badge: counts.restores || undefined },
    { href: "/admin/leads", label: "Leads", icon: "leads", needs: "viewCustomers", badge: counts.leads || undefined },
    { href: "/admin/bookings", label: "Pre-sales calls", icon: "bookings", needs: "viewCustomers", badge: counts.bookings || undefined },
    { href: "/admin/quotes", label: "Quotes", icon: "quotes", needs: "manageQuotes", badge: counts.quotes || undefined },
    { href: "/admin/payments", label: "EFT payments", icon: "payments", needs: "confirmPayments", badge: counts.eft || undefined },
    { href: "/admin/catalogue", label: "Catalogue", icon: "catalogue", needs: "manageCatalogue" },
    { href: "/admin/cloud-usage", label: "Azure usage", icon: "spend", needs: "manageCloudSpend" },
    { href: "/admin/pricing", label: "Pricing", icon: "pricing", needs: "managePricing" },
    { href: "/admin/markets", label: "Markets", icon: "markets", needs: "manageMarkets" },
    { href: "/admin/status", label: "Service status", icon: "status", needs: "manageStatus" },
    { href: "/admin/waitlist", label: "Waiting list", icon: "waitlist", needs: "viewCustomers", badge: counts.waitlist || undefined },
    { href: "/admin/staff", label: "Staff", icon: "staff", needs: "manageStaff" },
    { href: "/admin/migration", label: "Client migration", icon: "migration", needs: "migrateClients" },
    { href: "/admin/launch", label: "Launch checks", icon: "checks", needs: "manageMarkets" },
    { href: "/admin/company", label: "Company", icon: "company", needs: "manageCompany" },
    { href: "/admin/partners", label: "Partners", icon: "partners", needs: "managePartners" },
    { href: "/admin/features", label: "Features", icon: "features", needs: "manageFeatures" },
  ];
  const nav: NavItem[] = all.filter((i) => staffCan(staff, i.needs)).map(({ needs: _needs, ...i }) => i);
  // The website editor has its own page frame, so this link loads a new page.
  if (websiteRoleOf(session.user)) {
    nav.push({ href: "/admin/content", label: "Website", icon: "website" });
    nav.push({ href: "/admin/launch-kits", label: "Launch kits", icon: "launch", badge: counts.launchKits || undefined });
    nav.push({ href: "/admin/newsletter", label: "Newsletter", icon: "newsletter", badge: counts.newsletter || undefined });
    nav.push({ href: "/admin/redirects", label: "Old site addresses", icon: "redirects" });
  }
  nav.push({ href: "/admin/account", label: "Your sign-in", icon: "security" });
  const user = <UserCard name={staff.name} role={`${STAFF_ROLE_LABEL[staff.staffRole]} staff`} signOut={staffSignOutAction} />;

  const themeSwitch = <ThemeSwitch current={await currentTheme()} />;

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-1 focus:px-4 focus:py-2">
        Skip to content
      </a>
      {/* The column runs the page's full height with the sidebar colour; the sidebar itself stays in view. */}
      <div className="hidden w-sidebar shrink-0 border-r border-border bg-surface-1 lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto px-4 py-6">
          <Link href="/admin" className="flex flex-col items-start gap-2 self-start rounded-sm px-2">
            <Logo />
            <Badge tone="warning">Staff console</Badge>
          </Link>
          <SidebarNav items={nav} />
          <div className="mt-auto flex flex-col gap-4">
            {themeSwitch}
            {user}
          </div>
        </aside>
      </div>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface-1 px-4 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2 rounded-sm">
          <LogoMark size={32} />
          <Badge tone="warning">Staff</Badge>
        </Link>
        <MobileNav items={nav} header={<LogoMark size={32} />} footer={
            <div className="flex flex-col gap-4">
              {themeSwitch}
              {user}
            </div>
          }
        />
      </header>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8 2xl:px-12">
        <div className="mx-auto max-w-console">{children}</div>
      </main>
    </div>
  );
}
