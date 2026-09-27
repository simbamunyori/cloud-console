import { LogOut } from "lucide-react";
import { initials } from "@/lib/initials";

/** The signed-in person, with sign out. `signOut` is the server action for this console. */
export function UserCard({ name, role, signOut }: { name: string; role: string; signOut: () => Promise<void> }) {
  return (
    <div className="flex items-center gap-3 border-t border-border pt-4">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy text-callout font-semibold text-on-navy">
        {initials(name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-semibold text-ink">{name}</span>
        <span className="truncate text-caption text-ink-muted">{role}</span>
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut aria-hidden className="size-[18px]" />
        </button>
      </form>
    </div>
  );
}
