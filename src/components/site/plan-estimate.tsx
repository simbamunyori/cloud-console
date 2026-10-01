"use client";

import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatMoney, money } from "@/lib/domain/money";

export interface EstimatePlan {
  name: string;
  /** Minor units, as strings so they cross to the browser. */
  base: string;
  perUser: string;
}

const MAX_USERS = 300;

function Stepper({ users, setUsers, planName }: { users: number; setUsers: (n: number) => void; planName: string }) {
  const btn = "flex size-9 items-center justify-center text-ink hover:bg-surface-2 disabled:opacity-40";
  return (
    <span className="inline-flex items-center rounded-lg border border-site-frame">
      <button type="button" className={btn} onClick={() => setUsers(Math.max(1, users - 1))} disabled={users <= 1} aria-label={`One user fewer on ${planName}`}>
        <Minus aria-hidden className="size-4" />
      </button>
      <output aria-live="polite" aria-label="Users" className="flex h-9 min-w-12 items-center justify-center border-x border-site-frame px-3.5 font-semibold tabular-nums">
        {users}
      </output>
      <button type="button" className={btn} onClick={() => setUsers(Math.min(MAX_USERS, users + 1))} disabled={users >= MAX_USERS} aria-label={`One more user on ${planName}`}>
        <Plus aria-hidden className="size-4" />
      </button>
    </span>
  );
}

const total = (p: EstimatePlan, users: number, currency: string) => money(BigInt(p.base) + BigInt(p.perUser) * BigInt(users), currency);

/**
 * The recommended plan's monthly price for a number of users, from the
 * price book. Wide screens show it beside the plans' heading; phones show
 * it pinned under the table with the plan's button.
 */
export function PlanEstimate({ plan, users: start, locale, currency, variant, chooseHref, otherHref }: { plan: EstimatePlan; users: number; locale: string; currency: string; variant: "wide" | "phone"; chooseHref: string; otherHref?: string }) {
  const [users, setUsers] = useState(start);
  const price = formatMoney(total(plan, users, currency), locale);
  if (variant === "wide") {
    return (
      <div className="flex w-75 shrink-0 flex-col gap-2.5 rounded-lg border border-border px-6 py-5">
        <p className="text-callout text-ink-muted">Your estimate, {plan.name}</p>
        <div className="flex items-center gap-3.5 text-callout text-ink">
          Users <Stepper users={users} setUsers={setUsers} planName={plan.name} />
        </div>
        <p className="text-title-1 font-semibold text-ink tabular-nums">
          {price} <span className="text-callout font-normal text-ink-muted">a month</span>
        </p>
      </div>
    );
  }
  return (
    <div className="sticky bottom-0 flex flex-col gap-2.5 rounded-lg border border-border bg-surface-1 p-3.5">
      <div className="flex items-center justify-between gap-3 text-callout text-ink">
        <span>
          <strong>{plan.name}</strong>, {users} {users === 1 ? "user" : "users"}
        </span>
        <span className="font-semibold tabular-nums">{price} a month</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-callout text-ink">
        Users <Stepper users={users} setUsers={setUsers} planName={plan.name} />
      </div>
      <Link href={chooseHref} className="flex h-12 items-center justify-center rounded-sm bg-brand text-body font-semibold text-on-brand hover:bg-brand-hover">
        Choose {plan.name}
      </Link>
      {otherHref ? (
        <Link href={otherHref} className="text-center text-callout font-semibold text-link">
          See the other plans
        </Link>
      ) : null}
    </div>
  );
}
