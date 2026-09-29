"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { SelectField, TextareaField } from "@/components/ui/inputs";
import type { ActionState } from "@/server/action-state";
import { saveCategoryAction, saveFamilyAction, saveProductAction, setInternalOrganisationAction } from "./actions";

type Option = { value: string; label: string };

function Result({ state }: { state: ActionState }) {
  if (state.fieldErrors) return <Alert>Check the highlighted fields.</Alert>;
  if (state.ok && state.message) return <Alert tone="positive">{state.message}</Alert>;
  if (state.error) return <Alert>{state.error}</Alert>;
  return null;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t border-border pt-6 first-of-type:border-0 first-of-type:pt-0">
      <legend className="float-left mb-1 w-full">
        <span className="text-headline text-ink">{title}</span>
        {description ? <span className="mt-1 block text-callout text-ink-muted">{description}</span> : null}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Check({ name, value, label, defaultChecked }: { name: string; value?: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-body text-ink">
      <input type="checkbox" name={name} value={value ?? "on"} defaultChecked={defaultChecked} className="size-5 accent-brand" />
      {label}
    </label>
  );
}

const STATUS_OPTIONS: Option[] = [
  { value: "DRAFT", label: "Draft: hidden everywhere" },
  { value: "INTERNAL", label: "Internal: staff and our test organisations" },
  { value: "LIVE", label: "Live: on sale" },
];

export interface FamilyValues {
  key: string;
  name: string;
  description: string;
  connector: string;
  status: string;
  sortOrder: string;
}

export function FamilyForm({ family, connectors, existing }: { family: FamilyValues; connectors: Option[]; existing?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveFamilyAction, {});
  const v = { ...family, ...(state.values ?? {}) };
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {existing ? <input type="hidden" name="existing" value={existing} /> : null}
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        {existing ? null : <TextField id="key" label="Key" defaultValue={v.key} error={fe.key} hint="Lowercase with dashes, like web-and-domains. Can't be changed later." />}
        <TextField id="name" label="Name" defaultValue={v.name} error={fe.name} />
        <TextField id="description" label="Description" defaultValue={v.description} error={fe.description} className="sm:col-span-2" />
        <SelectField id="connector" label="Fulfilled by" options={connectors} defaultValue={v.connector} error={fe.connector} hint="The connector that sets up its products." />
        <SelectField id="status" label="Status" options={STATUS_OPTIONS} defaultValue={v.status} error={fe.status} hint="A draft or internal family hides all its products as well." />
        <TextField id="sortOrder" label="Position" inputMode="numeric" defaultValue={v.sortOrder} error={fe.sortOrder} hint="Lower numbers come first." />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : existing ? "Save family" : "Add family"}
        </Button>
      </div>
    </form>
  );
}

export interface CategoryValues {
  key: string;
  name: string;
  description: string;
  familyKey: string;
  sortOrder: string;
  margin: string;
}

export function CategoryForm({ category, families, existing }: { category: CategoryValues; families: Option[]; existing?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCategoryAction, {});
  const v = { ...category, ...(state.values ?? {}) };
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {existing ? <input type="hidden" name="existing" value={existing} /> : null}
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        {existing ? null : <TextField id="key" label="Key" defaultValue={v.key} error={fe.key} hint="Lowercase with dashes, like backups. Can't be changed later." />}
        <TextField id="name" label="Name" defaultValue={v.name} error={fe.name} hint="Shown as a heading in the marketplace and on the pricing page." />
        <TextField id="description" label="Description" defaultValue={v.description} error={fe.description} className="sm:col-span-2" />
        <SelectField id="familyKey" label="Family" options={families} defaultValue={v.familyKey} error={fe.familyKey} />
        <TextField id="sortOrder" label="Position" inputMode="numeric" defaultValue={v.sortOrder} error={fe.sortOrder} hint="Lower numbers come first within the family." />
        {existing ? null : (
          <TextField id="margin" label="Margin" inputMode="decimal" defaultValue={v.margin} error={fe.margin} hint="Percent on cost, e.g. 30. Change it later on the Pricing page." />
        )}
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : existing ? "Save category" : "Add category"}
        </Button>
      </div>
    </form>
  );
}

export interface ProductValues {
  slug: string;
  name: string;
  summary: string;
  includes: string;
  excludes: string;
  categoryKey: string;
  unitLabel: string;
  quantityAllowed: boolean;
  minQuantity: string;
  setupHours: string;
  minTermMonths: string;
  commitmentNote: string;
  cost: string;
  costCurrency: string;
  fixedPrice: string;
  fixedPriceCurrency: string;
  markets: string[];
  fulfilment: string;
  status: string;
  sortOrder: string;
}

export function ProductForm({
  product,
  categories,
  markets,
  currencies,
  fulfilments,
  existing,
}: {
  product: ProductValues;
  categories: Option[];
  markets: Option[];
  currencies: Option[];
  fulfilments: Option[];
  existing?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProductAction, {});
  const back = state.values;
  const v: ProductValues = back
    ? { ...product, ...back, markets: back.markets ? back.markets.split(",").filter(Boolean) : [], quantityAllowed: back.quantityAllowed === "on" }
    : product;
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-8" noValidate>
      {existing ? <input type="hidden" name="existing" value={existing} /> : null}
      <Result state={state} />
      <Section title="Product">
        {existing ? null : <TextField id="slug" label="Address" defaultValue={v.slug} error={fe.slug} hint="Lowercase with dashes, like vps-small. Can't be changed later." />}
        <TextField id="name" label="Name" defaultValue={v.name} error={fe.name} />
        <TextField id="summary" label="Summary" defaultValue={v.summary} error={fe.summary} className="sm:col-span-2" hint="One sentence, shown on its card." />
        <TextareaField id="includes" label="What's included" defaultValue={v.includes} error={fe.includes} hint="One per line." />
        <TextareaField id="excludes" label="Not included" defaultValue={v.excludes} error={fe.excludes} hint="One per line. Optional." />
        <SelectField id="categoryKey" label="Category" options={categories} defaultValue={v.categoryKey} error={fe.categoryKey} />
        <TextField id="sortOrder" label="Position" inputMode="numeric" defaultValue={v.sortOrder} error={fe.sortOrder} hint="Lower numbers come first in its category." />
      </Section>
      <Section title="Ordering">
        <TextField id="unitLabel" label="Unit" defaultValue={v.unitLabel} error={fe.unitLabel} hint="How the price reads, e.g. per user, per server." />
        <div className="flex flex-col">
          <Check name="quantityAllowed" label="The customer chooses how many" defaultChecked={v.quantityAllowed} />
        </div>
        <TextField id="minQuantity" label="Smallest quantity" inputMode="numeric" defaultValue={v.minQuantity} error={fe.minQuantity} />
        <TextField id="setupHours" label="Setup time" inputMode="numeric" defaultValue={v.setupHours} error={fe.setupHours} hint="Working hours. Customers see when to expect it." />
        <TextField id="minTermMonths" label="Minimum term" inputMode="numeric" defaultValue={v.minTermMonths} error={fe.minTermMonths} hint="Months. 1 is month to month." />
        <TextField id="commitmentNote" label="Terms" defaultValue={v.commitmentNote} error={fe.commitmentNote} hint="Plain words shown before ordering. Optional." />
      </Section>
      <Section title="Cost" description="What it costs us each month. It only feeds the suggested prices; customers see the prices approved on the Pricing page.">
        <TextField id="cost" label="Cost per unit" inputMode="decimal" defaultValue={v.cost} error={fe.cost} />
        <SelectField id="costCurrency" label="Cost currency" options={currencies} defaultValue={v.costCurrency} error={fe.costCurrency} />
        <TextField id="fixedPrice" label="Fixed price" inputMode="decimal" defaultValue={v.fixedPrice} error={fe.fixedPrice} hint="Optional. Suggests this price instead of cost plus margin." />
        <SelectField id="fixedPriceCurrency" label="Fixed price currency" options={currencies} defaultValue={v.fixedPriceCurrency} error={fe.fixedPriceCurrency} />
      </Section>
      <Section title="Where and how it's sold">
        <fieldset className="flex flex-col gap-1 sm:col-span-2">
          <legend className="text-callout font-semibold text-ink">Markets</legend>
          <div className="flex flex-wrap gap-x-8">
            {markets.map((m) => (
              <Check key={m.value} name="markets" value={m.value} label={m.label} defaultChecked={v.markets.includes(m.value)} />
            ))}
          </div>
          {fe.markets ? <p className="text-callout text-negative">{fe.markets}</p> : null}
        </fieldset>
        <SelectField id="fulfilment" label="Fulfilment" options={fulfilments} defaultValue={v.fulfilment} error={fe.fulfilment} />
        <SelectField
          id="status"
          label="Status"
          options={STATUS_OPTIONS}
          defaultValue={v.status}
          error={fe.status}
          hint="Internal and live need an approved price in each market, unless it's sold by quote."
        />
      </Section>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : existing ? "Save product" : "Add product"}
        </Button>
      </div>
    </form>
  );
}

/** On a customer's page: whether it is one of our own test organisations. */
export function InternalOrganisationSwitch({ organisationId, internal }: { organisationId: string; internal: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setInternalOrganisationAction, {});
  return (
    <form action={action} className="flex flex-col items-start gap-3">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="internal" value={internal ? "false" : "true"} />
      <Result state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {internal ? "Make it an ordinary customer" : "Make it a test organisation"}
      </Button>
    </form>
  );
}
