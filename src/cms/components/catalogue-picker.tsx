"use client";

import { FieldLabel, useConfig, useField } from "@payloadcms/ui";
import type { JSONFieldClientComponent } from "payload";
import { useEffect, useState } from "react";

type Selection = { categories?: string[]; products?: string[] };
type Options = { categories: { key: string; name: string; products: { slug: string; name: string; active: boolean }[] }[] };

const toggle = (list: string[] | undefined, value: string, on: boolean) => {
  const set = new Set(list ?? []);
  if (on) set.add(value);
  else set.delete(value);
  return [...set];
};

/**
 * Picks products from the console's catalogue: whole categories or single
 * products. Prices are never typed; the page shows the live price from
 * each market's price book.
 */
export const CataloguePicker: JSONFieldClientComponent = ({ field, path }) => {
  const { value, setValue } = useField<Selection>({ path });
  const { config } = useConfig();
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${config.routes.api}/pages/catalogue-options`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((o: Options) => live && setOptions(o))
      .catch(() => live && setError("The catalogue couldn't be loaded. Reload the page to try again."));
    return () => {
      live = false;
    };
  }, [config.routes.api]);

  const current: Selection = value && typeof value === "object" ? value : {};
  const update = (next: Selection) => setValue({ categories: next.categories ?? [], products: next.products ?? [] });

  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <FieldLabel label={field.label ?? "Products"} path={path} />
      {field.admin?.description ? <p style={{ margin: "0 0 8px", opacity: 0.75 }}>{String(field.admin.description)}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {!options && !error ? <p>Loading the catalogue…</p> : null}
      {options?.categories.map((c) => {
        const whole = current.categories?.includes(c.key) ?? false;
        return (
          <fieldset key={c.key} style={{ border: "1px solid var(--theme-elevation-150)", borderRadius: 4, padding: "8px 12px", marginBottom: 8 }}>
            <legend>
              <label>
                <input type="checkbox" checked={whole} onChange={(e) => update({ ...current, categories: toggle(current.categories, c.key, e.target.checked) })} /> {c.name} (every product)
              </label>
            </legend>
            {c.products.map((p) => (
              <label key={p.slug} style={{ display: "block", opacity: whole ? 0.5 : 1 }}>
                <input
                  type="checkbox"
                  disabled={whole}
                  checked={whole || (current.products?.includes(p.slug) ?? false)}
                  onChange={(e) => update({ ...current, products: toggle(current.products, p.slug, e.target.checked) })}
                />{" "}
                {p.name}
                {p.active ? "" : " (hidden)"}
              </label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
};
