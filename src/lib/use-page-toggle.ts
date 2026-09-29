import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * Open or closed, for a menu or panel that closes when the visitor follows a
 * link: it stays open only on the page it was opened on.
 */
export function usePageToggle(): [boolean, (open: boolean) => void] {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const setOpen = useCallback((open: boolean) => setOpenOn(open ? pathname : null), [pathname]);
  return [openOn === pathname, setOpen];
}
