"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { confirmAction, unsubscribeAction } from "./actions";

/** One button, so a mail scanner opening the link doesn't subscribe or unsubscribe anyone. */
export function TokenButton({ token, kind }: { token: string; kind: "confirm" | "unsubscribe" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(kind === "confirm" ? confirmAction : unsubscribeAction, {});
  if (state.ok) return <Alert tone="positive">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={pending} className="w-fit">
        {kind === "confirm" ? "Confirm my subscription" : "Unsubscribe"}
      </Button>
    </form>
  );
}
