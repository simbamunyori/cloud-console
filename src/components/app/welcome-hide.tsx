"use client";

import { useActionState } from "react";
import { hideWelcomeAction } from "@/app/(frontend)/app/experience-actions";
import type { ActionState } from "@/server/action-state";

export function HideWelcomeButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(hideWelcomeAction, {});
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="text-callout text-link hover:underline disabled:opacity-60">
        {pending ? "Hiding…" : "Hide this"}
      </button>
      {state.error ? (
        <p role="alert" className="text-caption text-negative">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
