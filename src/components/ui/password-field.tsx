"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Field, inputClass } from "./field";

export interface PasswordFieldProps {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  /** Show live length guidance, for choosing a new password. */
  showStrength?: boolean;
  minLength?: number;
}

export function PasswordField({ id, label, autoComplete, error, showStrength, minLength = 12 }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const long = value.length >= minLength;

  const hint = showStrength ? (
    <span className={cn("flex items-center gap-1.5", long ? "text-positive" : "text-ink-muted")}>
      {long ? <CheckCircle2 aria-hidden className="size-3.5" /> : <CircleAlert aria-hidden className="size-3.5" />}
      {long ? `Good. At least ${minLength} characters.` : `At least ${minLength} characters. A short phrase works well.`}
    </span>
  ) : undefined;

  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {(describedBy, invalid) => (
        <div className="relative">
          <input
            id={id}
            name={id}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(inputClass, "pr-20")}
            spellCheck={false}
            autoCapitalize="none"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-controls={id}
            className="absolute top-1.5 right-1.5 h-8 rounded-sm px-2.5 text-callout font-medium text-link hover:bg-surface-2"
          >
            {visible ? "Hide" : "Show"}
            <span className="sr-only"> password</span>
          </button>
        </div>
      )}
    </Field>
  );
}
