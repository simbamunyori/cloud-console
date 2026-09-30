"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { savingAction } from "./actions";

export function SavingActions({ tipId, title }: { tipId: string; title: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savingAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="tipId" value={tipId} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="ask" size="sm" disabled={pending} aria-label={`Ask us to do it: ${title}`}>
          Ask us to do it
        </Button>
        <Button type="submit" name="intent" value="dismiss" size="sm" variant="ghost" disabled={pending} aria-label={`Hide: ${title}`}>
          Hide
        </Button>
      </div>
      {state.error ? <span className="text-caption text-negative">{state.error}</span> : null}
    </form>
  );
}
