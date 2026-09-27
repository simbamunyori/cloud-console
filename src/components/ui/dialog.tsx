"use client";

import { X } from "lucide-react";
import * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * A modal built on the native <dialog>, which gives focus trapping,
 * Escape to close and an inert background for free.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto w-dialog rounded-lg border border-border bg-surface-1 p-0 text-ink shadow-elevation-3 backdrop:bg-scrim",
        className,
      )}
    >
      {open ? (
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-title-2 text-ink">
                {title}
              </h2>
              {description ? <p className="text-body text-ink-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
              aria-label="Close"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
