import Link from "next/link";
import { signOutAction } from "@/app/(frontend)/(auth)/actions";
import { Search } from "lucide-react";
import { MobileNav } from "@/components/app/mobile-nav";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { SidebarNav, type NavItem } from "@/components/app/sidebar-nav";
import { TopActions, TopBar } from "@/components/app/top-bar";
import { UserCard } from "@/components/app/user-card";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Logo, LogoMark } from "@/components/ui/logo";
import { organisationsFor } from "@/server/auth/service";
import { prisma } from "@/server/db";
import { ROLE_LABEL } from "@/server/org/access";
import { requireMember } from "@/server/org/context";
import { currentTheme } from "@/server/theme";

const NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: "home", exact: true },
  { href: "/app/marketplace", label: "Marketplace", icon: "marketplace" },
  { href: "/app/services", label: "Services", icon: "services" },
  { href: "/app/billing", label: "Billing", icon: "billing" },
  { href: "/app/support", label: "Support", icon: "support" },
  { href: "/app/team", label: "Team", icon: "team" },
  { href: "/app/security", label: "Security", icon: "security" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { actor, organisation } = await requireMember();
  const memberships = await organisationsFor(prisma, actor.userId);
  const org = (up?: boolean) => (
    <OrgSwitcher
      up={up}
      current={{ id: organisation.id, name: organisation.name, role: ROLE_LABEL[actor.role] }}
      options={memberships.map((m) => ({ id: m.id, name: m.name, role: ROLE_LABEL[m.role] }))}
    />
  );
  const user = <UserCard name={actor.name} role={ROLE_LABEL[actor.role]} signOut={signOutAction} />;

  const themeSwitch = <ThemeSwitch current={await currentTheme()} />;

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface-1 focus:px-4 focus:py-2"
      >
        Skip to content
      </a>
      {/* The column runs the page's full height with the sidebar colour; the sidebar itself stays in view. */}
      <div className="hidden w-sidebar shrink-0 border-r border-border bg-surface-1 lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto px-4 py-6">
          <Link href="/app" className="self-start rounded-sm px-2">
            <Logo />
          </Link>
          {org()}
          <SidebarNav items={NAV} />
          <div className="mt-auto flex flex-col gap-4">
            {themeSwitch}
            {user}
          </div>
        </aside>
      </div>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-border bg-surface-1 px-4 lg:hidden">
        <Link href="/app" className="mr-auto rounded-sm">
          <LogoMark size={32} />
        </Link>
        <Link href="/app/search" aria-label="Search" className="flex size-11 items-center justify-center rounded-md text-ink hover:bg-surface-2">
          <Search aria-hidden className="size-5" />
        </Link>
        <TopActions />
        <MobileNav
          items={NAV}
          header={<LogoMark size={32} />}
          footer={
            <div className="flex flex-col gap-4">
              {org(true)}
              {themeSwitch}
              {user}
            </div>
          }
        />
      </header>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
          <div className="mx-auto max-w-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
