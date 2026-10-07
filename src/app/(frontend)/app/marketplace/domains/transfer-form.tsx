"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-state";
import { transferDomainAction } from "../actions";
import { StartNowField } from "../start-now";

/** Bringing a domain over from another provider with its transfer code. */
export function TransferDomainForm({ refundsHref }: { refundsHref: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(transferDomainAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="transfer-domain" name="domain" label="Domain" placeholder="yourcompany.com" defaultValue={state.values?.domain} error={fe.domain} autoCapitalize="none" spellCheck={false} />
        <TextField
          id="transfer-code"
          name="authCode"
          label="Transfer code"
          hint="From your current provider. Also called an auth or EPP code."
          error={fe.authCode}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {refundsHref ? <StartNowField id="transfer-startNow" refundsHref={refundsHref} error={fe.startNow} /> : null}
      <p className="text-callout text-ink-muted">A transfer adds a year to the domain and is invoiced at the yearly renewal price. It usually completes within five days.</p>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Ordering…" : "Transfer the domain"}
      </Button>
    </form>
  );
}
