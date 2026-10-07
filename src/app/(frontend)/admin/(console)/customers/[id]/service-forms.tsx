"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { DateField, SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { moveToOurServersAction, recordThebeAction, setAccountContactAction, setHostingAction, setReviewAction } from "./service-actions";

function Messages({ state }: { state: ActionState }) {
  return (
    <>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="positive">{state.message}</Alert> : null}
    </>
  );
}

const PLACES = [
  { value: "CONTABO", label: "Contabo" },
  { value: "SITEGROUND", label: "SiteGround" },
  { value: "OTHER", label: "Another provider" },
];

export function HostingForm({ organisationId, serviceId, current }: { organisationId: string; serviceId: string; current: { hostedAt: string; hostServer: string; hostNotes: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setHostingAction, {});
  const fe = state.fieldErrors ?? {};
  const id = (k: string) => `${k}-${serviceId}`;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField id={id("hostedAt")} name="hostedAt" label="Runs at" defaultValue={current.hostedAt === "OURS" ? "CONTABO" : current.hostedAt} options={PLACES} error={fe.hostedAt} />
        <TextField id={id("hostServer")} name="hostServer" label="Server or account" defaultValue={current.hostServer} error={fe.hostServer} />
      </div>
      <TextareaField id={id("hostNotes")} name="hostNotes" label="Notes for whoever does the work" rows={3} defaultValue={current.hostNotes} />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save where it runs"}
      </Button>
    </form>
  );
}

export function MoveForm({ organisationId, serviceId }: { organisationId: string; serviceId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(moveToOurServersAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <p className="text-callout text-ink-muted">Once it runs on our servers, billing manages it like any other service and no more tasks are made.</p>
      <Button type="submit" disabled={pending || state.ok}>
        {pending ? "Moving…" : "Move to our servers"}
      </Button>
    </form>
  );
}

export function ReviewForm({ organisationId, serviceId, current }: { organisationId: string; serviceId: string; current: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setReviewAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <DateField id={`reviewOn-${serviceId}`} name="reviewOn" label="Review the kept price on" hint="Optional. Nothing changes by itself on the day." defaultValue={current} error={fe.reviewOn} className="max-w-xs" />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save the review date"}
      </Button>
    </form>
  );
}

export function ThebeForm({ organisationId, current }: { organisationId: string; current: { thebeId: string; url: string } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(recordThebeAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField id="thebeId" name="thebeId" label="Thebe's id for the organisation" defaultValue={state.values?.thebeId ?? current.thebeId} error={fe.thebeId} />
        <TextField id="thebeUrl" name="url" label="Sign-in address" type="url" defaultValue={state.values?.url ?? current.url} error={fe.url} />
      </div>
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Record the Thebe organisation"}
      </Button>
    </form>
  );
}

export function AccountContactForm({ organisationId, current, colleagues }: { organisationId: string; current: string; colleagues: { value: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setAccountContactAction, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Messages state={state} />
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <SelectField id="userId" name="userId" label="Looked after by" className="sm:min-w-72" defaultValue={current} options={[{ value: "", label: "Nobody named" }, ...colleagues]} error={state.fieldErrors?.userId} />
        <Button type="submit" variant="secondary" disabled={pending} className="self-start sm:self-end">
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
