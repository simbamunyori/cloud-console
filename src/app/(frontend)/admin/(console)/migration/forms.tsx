"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { DateField, SelectField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { approveImportAction, carryOnAction, chooseProductsAction, setCutoverAction, uploadExportsAction } from "./actions";

const fileClass = "w-full text-callout text-ink file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-2 file:font-semibold file:text-ink";

function Messages({ state }: { state: ActionState }) {
  return (
    <>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
    </>
  );
}

export function UploadForm({ files }: { files: { key: string; label: string; required: boolean; hint: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadExportsAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <Messages state={state} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {files.map((f) => (
          <Field key={f.key} id={`file-${f.key}`} label={`${f.label} (CSV)${f.required ? "" : ", if you have any"}`} hint={f.hint} error={fe[f.key]}>
            {(describedBy, invalid) => <input id={`file-${f.key}`} name={f.key} type="file" accept=".csv,text/csv" aria-describedby={describedBy} aria-invalid={invalid || undefined} className={fileClass} />}
          </Field>
        ))}
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Reading…" : "Read the files"}
      </Button>
    </form>
  );
}

export function ProductChoices({ batchId, rows, options }: { batchId: string; rows: { odooProduct: string; current: string; lines: number; how: string }[]; options: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(chooseProductsAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Messages state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      <ul className="divide-y divide-border">
        {rows.map((r, i) => (
          <li key={r.odooProduct} className="grid grid-cols-1 items-end gap-3 py-3 md:grid-cols-2">
            <input type="hidden" name={`name:${i}`} value={r.odooProduct} />
            <span className="flex min-w-0 flex-col">
              <span className="break-words text-ink">{r.odooProduct}</span>
              <span className="text-callout text-ink-muted">
                {r.lines} {r.lines === 1 ? "line" : "lines"}, {r.how}
              </span>
            </span>
            <SelectField id={`product-${i}`} name={`product:${i}`} label={`Bring ${r.odooProduct} over as`} defaultValue={r.current} options={options} />
          </li>
        ))}
      </ul>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Working it out…" : "Use these products"}
      </Button>
    </form>
  );
}

export function ApproveForm({ batchId, hash, summary }: { batchId: string; hash: string; summary: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(approveImportAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <Messages state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="hash" value={hash} />
      <p className="text-ink-body">{summary}</p>
      <Button type="submit" disabled={pending || state.ok}>
        {pending ? "Approving…" : "Approve and import"}
      </Button>
    </form>
  );
}

export function CarryOnForm({ batchId, unfinished }: { batchId: string; unfinished: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(carryOnAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <Messages state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      {unfinished ? (
        <label className="flex items-start gap-3 text-ink-body">
          <input type="checkbox" name="checked" value="yes" required className="mt-1 size-4 accent-brand" />
          <span>I checked billing for the items above and removed anything half-made there.</span>
        </label>
      ) : null}
      <Button type="submit" disabled={pending || state.ok}>
        {pending ? "Starting…" : unfinished ? "Clear them and carry on" : "Carry on"}
      </Button>
    </form>
  );
}

export function CutoverForm({ batchId, current, min }: { batchId: string; current: string; min: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setCutoverAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      <DateField id="cutoverOn" label="Send the welcome emails on" hint="From 08:00 Gaborone time that day. Leave it empty to hold them." defaultValue={current} min={min} error={fe.cutoverOn} className="max-w-xs" />
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save the cutover date"}
      </Button>
    </form>
  );
}
