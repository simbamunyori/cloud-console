/* eslint-disable @next/next/no-img-element -- SVG logos are served as delivered, no optimisation needed. */
import { cn } from "@/lib/cn";
import { company } from "@/config/app";

/**
 * The brand pack's files, used exactly as delivered (brand/BRAND.md).
 * The full lockup needs at least 160 px wide (44 px tall); below that, use the mark.
 * The lockup and reverse lockup swap with the colour scheme.
 */
export function Logo({ className, height = 44 }: { className?: string; height?: number }) {
  const width = Math.round((height * 612) / 160);
  return (
    <span className={cn("inline-flex", className)}>
      <img src="/brand/logo/fgt-logo.svg" alt={company.name} width={width} height={height} className="dark:hidden" />
      <img
        src="/brand/logo/fgt-logo-reverse.svg"
        alt={company.name}
        width={width}
        height={height}
        className="hidden dark:block"
      />
    </span>
  );
}

/** The mark alone, for phone widths and small spaces. */
export function LogoMark({ size = 32, className, onDark = false, title = company.name }: { size?: number; className?: string; onDark?: boolean; title?: string }) {
  return (
    <img
      src={onDark ? "/brand/logo/fgt-mark-light.svg" : "/brand/logo/fgt-mark.svg"}
      alt={title}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
    />
  );
}

/** Lockup on wide screens, mark alone on phones (brand/BRAND.md). */
export function ResponsiveLogo() {
  return (
    <>
      <LogoMark size={32} className="sm:hidden" />
      <Logo height={44} className="hidden sm:inline-flex" />
    </>
  );
}
