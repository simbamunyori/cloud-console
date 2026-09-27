import * as React from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "h-11 w-full rounded-md border border-border-strong bg-surface-1 px-3 text-body text-ink placeholder:text-ink-muted/70 transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus aria-invalid:border-negative disabled:opacity-60";

export interface FieldProps {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  children: (describedBy: string | undefined, invalid: boolean) => React.ReactNode;
  className?: string;
}

/** Label, control, then either the error or the hint below it. */
export function Field({ id, label, hint, error, children, className }: FieldProps) {
  const noteId = error || hint ? `${id}-note` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-callout font-semibold text-ink">
        {label}
      </label>
      {children(noteId, Boolean(error))}
      {error ? (
        <p id={noteId} className="text-callout text-negative">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="text-callout text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "children"> {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
}

export function TextField({ id, label, hint, error, className, ...props }: TextFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      {(describedBy, invalid) => (
        <input
          id={id}
          name={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={inputClass}
          {...props}
        />
      )}
    </Field>
  );
}
