"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarNav, type NavItem } from "./sidebar-nav";

/** The sidebar as a sheet on narrow screens. */
export function MobileNav({ header, footer, items }: { header: React.ReactNode; footer: React.ReactNode; items: NavItem[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex size-11 items-center justify-center rounded-md text-ink hover:bg-surface-2"
        aria-label="Open menu"
      >
        <Menu aria-hidden className="size-5" />
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-surface-1 p-0 text-ink backdrop:bg-scrim"
      >
        <div className="flex h-full flex-col gap-6 p-4">
          <div className="flex items-center justify-between">
            {header}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-10 items-center justify-center rounded-md hover:bg-surface-2"
              aria-label="Close menu"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <SidebarNav onNavigate={() => setOpen(false)} items={items} />
          <div className="mt-auto">{footer}</div>
        </div>
      </dialog>
    </>
  );
}
