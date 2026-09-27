"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface CodeInputProps {
  name: string;
  label: string;
  length?: number;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  /** Called with the full code once every box is filled, e.g. to submit. */
  onComplete?: (code: string) => void;
}

/**
 * Six boxes for a one-time code. Accepts typing, pasting a whole code,
 * the phone's code suggestion (autocomplete="one-time-code"), backspace
 * and arrow keys. The value is submitted through a hidden input.
 */
export function CodeInput({ name, label, length = 6, invalid, describedBy, autoFocus, onComplete }: CodeInputProps) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join("");
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });
  // Runs after render, so the hidden input already holds the full code
  // when the form is submitted.
  useEffect(() => {
    if (code.length === length) onCompleteRef.current?.(code);
  }, [code, length]);

  function update(next: string[], focusIndex?: number) {
    setDigits(next);
    if (focusIndex !== undefined) refs.current[Math.min(focusIndex, length - 1)]?.focus();
  }

  function fill(from: number, text: string) {
    const clean = text.replace(/\D/g, "").slice(0, length - from);
    if (!clean) return;
    const next = [...digits];
    for (let i = 0; i < clean.length; i++) next[from + i] = clean[i];
    update(next, from + clean.length);
  }

  return (
    <div role="group" aria-label={label} aria-describedby={describedBy} className="flex gap-2">
      <input type="hidden" name={name} value={code} />
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          maxLength={i === 0 ? length : 1}
          value={d}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = e.target.value;
            if (v.length > 1) return fill(i, v);
            const next = [...digits];
            next[i] = v.replace(/\D/g, "");
            update(next, next[i] ? i + 1 : undefined);
          }}
          onPaste={(e) => {
            e.preventDefault();
            fill(i, e.clipboardData.getData("text"));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) {
              const next = [...digits];
              next[i - 1] = "";
              update(next, i - 1);
              e.preventDefault();
            } else if (e.key === "ArrowLeft" && i > 0) {
              refs.current[i - 1]?.focus();
              e.preventDefault();
            } else if (e.key === "ArrowRight" && i < length - 1) {
              refs.current[i + 1]?.focus();
              e.preventDefault();
            }
          }}
          className={cn(
            "h-14 w-12 rounded-md border bg-surface-1 text-center text-title-2 font-semibold text-ink tabular-nums transition-colors",
            "focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus",
            invalid ? "border-negative" : "border-border-strong",
          )}
        />
      ))}
    </div>
  );
}
