"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** What a console section shows when it can't load, for example when billing isn't answering. */
export function SectionError({ title, reset, children }: { title: string; reset: () => void; children?: React.ReactNode }) {
  return (
    <EmptyState
      icon={RefreshCw}
      title={title}
      action={
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      }
    >
      {children ?? "Something on our side didn't answer in time. Your account and data are fine. Try again, and if it keeps happening, contact support."}
    </EmptyState>
  );
}
