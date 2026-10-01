"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { stopEmailsAction } from "./actions";

export function StopForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(stopEmailsAction, {});
  if (state.ok) {
    return (
      <p role="status" className="text-body text-ink">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Stopping…" : "Stop the emails"}
        </Button>
      </div>
    </form>
  );
}
