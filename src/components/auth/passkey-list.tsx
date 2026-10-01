"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { PasskeyButton, usePasskeySupport } from "@/components/auth/passkey-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";

export interface PasskeyRow {
  id: string;
  name: string;
  /** Already written for the reader, e.g. "Added 3 Oct 2026, last used today". */
  detail: string;
}

type State = { error?: string; message?: string };
type Action = (prev: State, form: FormData) => Promise<State>;

/** The person's passkeys: add, rename and remove. Removing needs the recent check. */
export function PasskeyList({ passkeys, audience = "CUSTOMER", removeAction, renameAction }: { passkeys: PasskeyRow[]; audience?: "CUSTOMER" | "STAFF"; removeAction: Action; renameAction: Action }) {
  const router = useRouter();
  const supported = usePasskeySupport();
  const [added, setAdded] = useState(false);
  const [removed, remove, removing] = useActionState<State, FormData>(removeAction, {});
  const outcome = removed.error
    ? { tone: "negative" as const, text: removed.error }
    : removed.message
      ? { tone: "positive" as const, text: removed.message }
      : added
        ? { tone: "positive" as const, text: "Passkey added." }
        : null;
  return (
    <div className="flex flex-col gap-4">
      {outcome ? <Alert tone={outcome.tone}>{outcome.text}</Alert> : null}
      {passkeys.length ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <KeyRound aria-hidden className="hidden size-5 shrink-0 text-ink-muted sm:block" />
              <div className="flex flex-1 flex-col">
                <span className="font-semibold text-ink">{p.name}</span>
                <span className="text-callout text-ink-muted">{p.detail}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Rename passkey={p} action={renameAction} />
                <form action={remove}>
                  <input type="hidden" name="passkeyId" value={p.id} />
                  <Button type="submit" variant="ghost" size="sm" disabled={removing} aria-label={`Remove ${p.name}`}>
                    Remove
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-callout text-ink-muted">
          {supported ? "No passkeys yet. Add one to sign in with your fingerprint, face or device PIN." : "No passkeys yet. This browser can't make one; try another device."}
        </p>
      )}
      <PasskeyButton
        purpose="add"
        audience={audience}
        size="md"
        className="self-start"
        onDone={() => {
          setAdded(true);
          router.refresh();
        }}
      >
        Add a passkey
      </PasskeyButton>
    </div>
  );
}

function Rename({ passkey, action }: { passkey: PasskeyRow; action: Action }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<State, FormData>(async (prev, form) => {
    const result = await action(prev, form);
    if (!result.error) setOpen(false);
    return result;
  }, {});
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Rename ${passkey.name}`}>
        Rename
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="passkeyId" value={passkey.id} />
      <TextField id={`name-${passkey.id}`} name="name" label="Name" defaultValue={passkey.name} maxLength={60} required autoFocus error={state.error} />
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
