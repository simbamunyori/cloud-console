"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import type { PartnerField } from "@/server/partners/partners";
import { fetchDomainCostsAction, savePartnerAction, setPartnerEnabledAction, testPartnerAction } from "./actions";

function Result({ state }: { state: ActionState }) {
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return null;
}

export function PartnerSettingsForm({
  partner,
  fields,
  values,
  secretsSet,
}: {
  partner: string;
  fields: PartnerField[];
  values: Record<string, string>;
  secretsSet: Record<string, boolean>;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePartnerAction, {});
  const v = { ...values, ...(state.values ?? {}) };
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="key" value={partner} />
      {state.fieldErrors ? <Alert>Check the highlighted fields.</Alert> : <Result state={state} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const hint = f.secret ? [secretsSet[f.name] ? "Saved. Leave empty to keep it." : "Not set yet.", f.hint].filter(Boolean).join(" ") : f.hint;
          const wide = f.kind === "textarea" ? "sm:col-span-2" : undefined;
          if (f.kind === "select")
            return <SelectField key={f.name} id={f.name} label={f.label} hint={hint} error={fe[f.name]} options={f.options ?? []} defaultValue={v[f.name]} />;
          if (f.kind === "textarea")
            return (
              <TextareaField
                key={f.name}
                id={f.name}
                label={f.label}
                hint={hint}
                error={fe[f.name]}
                className={wide}
                rows={f.secret ? 4 : 3}
                defaultValue={f.secret ? "" : v[f.name]}
                autoComplete="off"
                spellCheck={false}
              />
            );
          return (
            <TextField
              key={f.name}
              id={f.name}
              label={f.label}
              hint={hint}
              error={fe[f.name]}
              type={f.kind === "password" ? "password" : "text"}
              inputMode={f.kind === "number" ? "numeric" : undefined}
              defaultValue={f.secret ? "" : v[f.name]}
              autoComplete={f.secret ? "new-password" : "off"}
            />
          );
        })}
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        Save settings
      </Button>
    </form>
  );
}

export function TestPartnerButton({ partner }: { partner: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(testPartnerAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="key" value={partner} />
      <Result state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        {pending ? "Testing" : "Test connection"}
      </Button>
    </form>
  );
}

export function PartnerSwitch({ partner, enabled, canEnable }: { partner: string; enabled: boolean; canEnable: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setPartnerEnabledAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="key" value={partner} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <Result state={state} />
      <Button type="submit" variant={enabled ? "secondary" : "primary"} disabled={pending || (!enabled && !canEnable)} className="w-fit">
        {enabled ? "Switch off" : "Switch on"}
      </Button>
    </form>
  );
}

export function FetchCostsButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(fetchDomainCostsAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Result state={state} />
      <Button type="submit" variant="secondary" disabled={pending} className="w-fit">
        {pending ? "Fetching" : "Fetch costs now"}
      </Button>
    </form>
  );
}
