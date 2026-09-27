import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";
import { Field, inputClass } from "./field";

interface BaseProps {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
}

/** A native select drawn like the other inputs, with a chevron icon over it. */
export const selectClass = "appearance-none pr-10";

/** An amount in the organisation's currency, typed as text like "12,400.00". */
export function MoneyField({
  id,
  label,
  hint,
  error,
  className,
  currencySymbol = "P",
  ...props
}: BaseProps & { currencySymbol?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      {(describedBy, invalid) => (
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-muted">
            {currencySymbol}
          </span>
          <input
            id={id}
            name={id}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(inputClass, "pl-8 tabular-nums")}
            {...props}
          />
        </div>
      )}
    </Field>
  );
}

export function DateField({
  id,
  label,
  hint,
  error,
  className,
  ...props
}: BaseProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type">) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      {(describedBy, invalid) => (
        <input
          id={id}
          name={id}
          type="date"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(inputClass, "tabular-nums")}
          {...props}
        />
      )}
    </Field>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  className,
  options,
  placeholder,
  ...props
}: BaseProps & {
  options: { value: string; label: string }[];
  placeholder?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      {(describedBy, invalid) => (
        <div className="relative">
          <select
            id={id}
            name={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(inputClass, selectClass)}
            {...props}
          >
            {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted" />
        </div>
      )}
    </Field>
  );
}
