"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** Shown when a page can't load, for example when billing isn't answering. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={RefreshCw}
      title="This page did not load"
      action={
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      }
    >
      Something on our side didn&apos;t answer in time. Your account and data are fine. Try again, and if it keeps happening, contact support.
    </EmptyState>
  );
}
