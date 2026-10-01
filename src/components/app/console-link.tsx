import Link from "next/link";

/**
 * A console link, or in the public site's demo of the console (`demo`), the
 * same thing drawn without a link: the demo is a picture, so it neither
 * prefetches console pages nor sends anyone into them.
 */
export function ConsoleLink({ demo = false, href, className, children }: { demo?: boolean; href: string; className?: string; children: React.ReactNode }) {
  return demo ? (
    <span className={className}>{children}</span>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
