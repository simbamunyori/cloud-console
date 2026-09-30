"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";

export interface ChartMonth {
  /** "2026-09". */
  key: string;
  /** "Sep". */
  short: string;
  /** "September 2026". */
  long: string;
  value: number;
  /** The total, written out. */
  label: string;
  categories: { name: string; label: string }[];
  /** This month: the bar is what's been spent so far. */
  current: boolean;
  /** This month's forecast, for the outline above the bar. */
  forecast?: number;
  forecastLabel?: string;
  selected: boolean;
}

/** Round axis steps: 1, 2 or 5 times a power of ten, three or four of them. */
function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/**
 * Spend by month as bars, one series. Each bar links to that month's
 * breakdown; hovering or focusing one shows what it was made of. This
 * month shows what's spent so far, with the forecast as an outline.
 */
export function SpendChart({ months, locale, currency, exponent }: { months: ChartMonth[]; locale: string; currency: string; exponent: number }) {
  const compact = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const axisLabel = (minor: number) => compact.format(minor / 10 ** exponent);
  const [active, setActive] = useState<string | null>(null);
  const top = Math.max(...months.map((m) => Math.max(m.value, m.forecast ?? 0)), 1);
  const scale = ticks(top);
  const max = scale[scale.length - 1] || 1;
  const pct = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  const shown = months.find((m) => m.key === active);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex gap-2 sm:gap-3">
        {/* Axis labels, beside the plot and the same height. */}
        <div aria-hidden className="relative h-64 w-12 shrink-0 sm:w-14">
          {scale.map((v) => (
            <span key={v} className="absolute right-0 translate-y-1/2 text-caption text-ink-muted tabular-nums" style={{ bottom: pct(v) }}>
              {axisLabel(v)}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="relative h-64">
            {/* Quiet grid lines behind the bars. */}
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {scale.map((v) => (
                <div key={v} className="absolute inset-x-0 border-t border-border" style={{ bottom: pct(v) }} />
              ))}
            </div>
            <ol className="relative flex h-full items-end gap-1 sm:gap-2">
              {months.map((m) => (
                <li key={m.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  <Link
                    href={`?month=${m.key}#breakdown`}
                    scroll={false}
                    aria-label={`${m.long}: ${m.label}${m.current ? " so far" : ""}${m.forecastLabel ? `, forecast ${m.forecastLabel}` : ""}`}
                    aria-current={m.selected ? "true" : undefined}
                    onMouseEnter={() => setActive(m.key)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(m.key)}
                    onBlur={() => setActive(null)}
                    className="group relative flex h-full items-end justify-center rounded-t-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {m.forecast !== undefined && m.forecast > m.value ? (
                      <span aria-hidden className="absolute bottom-0 w-full max-w-12 rounded-t-sm border-2 border-dashed border-brand/60" style={{ height: pct(m.forecast) }} />
                    ) : null}
                    <span
                      aria-hidden
                      className={cn(
                        "relative w-full max-w-12 rounded-t-sm transition-opacity",
                        m.current ? "bg-brand/55" : "bg-brand",
                        m.selected ? "ring-2 ring-ink ring-offset-2 ring-offset-surface-1" : "",
                        active && active !== m.key ? "opacity-60" : "",
                      )}
                      style={{
                        height: m.value > 0 ? `max(${pct(m.value)}, 2px)` : "0",
                      }}
                    />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
          <ol aria-hidden className="flex gap-1 sm:gap-2">
            {months.map((m, i) => (
              <li key={m.key} className={cn("min-w-0 flex-1 text-center text-caption", m.selected ? "font-semibold text-ink" : "text-ink-muted", i % 2 === 1 ? "max-sm:invisible" : "")}>
                {m.short}
              </li>
            ))}
          </ol>
        </div>
        {shown ? (
          <div role="status" className="pointer-events-none absolute top-0 right-0 z-10 flex w-64 flex-col gap-1 rounded-md border border-border bg-surface-1 p-3 text-callout shadow-elevation-2">
            <span className="font-semibold text-ink">
              {shown.long}
              {shown.current ? ", so far" : ""}
            </span>
            <span className="text-title-2 text-ink tabular-nums">{shown.label}</span>
            {shown.forecastLabel ? <span className="text-ink-muted">Forecast {shown.forecastLabel}</span> : null}
            <ul className="mt-1 flex flex-col gap-0.5">
              {shown.categories.slice(0, 5).map((c) => (
                <li key={c.name} className="flex justify-between gap-3">
                  <span className="truncate text-ink-muted">{c.name}</span>
                  <span className="text-ink tabular-nums">{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-ink-muted">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-sm bg-brand" /> Spent
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-sm bg-brand/55" /> This month so far
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-sm border-2 border-dashed border-brand/60" /> Forecast
        </span>
      </div>
    </div>
  );
}
