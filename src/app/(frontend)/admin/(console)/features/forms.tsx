"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { setFeatureAction } from "./actions";

export function FeatureToggle({ id, label, enabled }: { id: string; label: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setFeatureAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
      <input type="hidden" name="key" value={id} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <Button type="submit" size="sm" variant={enabled ? "secondary" : "primary"} disabled={pending} aria-label={`${enabled ? "Turn off" : "Turn on"} ${label}`}>
        {enabled ? "Turn off" : "Turn on"}
      </Button>
      {state.error ? <Alert>{state.error}</Alert> : null}
    </form>
  );
}
