"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { cancelCallAction } from "../../actions";

export function CancelForm({ token, again }: { token: string; again: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelCallAction, {});
  if (state.ok) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="text-body text-ink">{state.message}</p>
        <Link href={again} className="font-semibold text-link hover:underline">
          Book another time
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div>
        <Button type="submit" variant="destructive" size="lg" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel the call"}
        </Button>
      </div>
    </form>
  );
}
