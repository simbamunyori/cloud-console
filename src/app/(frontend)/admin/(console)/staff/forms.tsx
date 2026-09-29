"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-state";
import { setWebsiteRoleAction } from "./actions";

export function WebsiteRoleForm({ userId, name, current }: { userId: string; name: string; current: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setWebsiteRoleAction, {});
  return (
    <form action={action} className="flex flex-col gap-1 sm:items-end">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`website-role-${userId}`}>
          Website role for {name}
        </label>
        <select id={`website-role-${userId}`} name="websiteRole" defaultValue={current} className="h-10 rounded-md border border-border-strong bg-surface-1 px-3 text-callout text-ink">
          <option value="NONE">No website role</option>
          <option value="EDITOR">Editor</option>
          <option value="PUBLISHER">Publisher</option>
        </select>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {state.error ? <p className="text-callout text-negative">{state.error}</p> : state.ok ? <p className="text-callout text-positive">Saved</p> : null}
    </form>
  );
}
