"use client";

import { cx } from "./cx";

export interface FilterChipOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterChipsProps {
  options: FilterChipOption[];
  value: string | string[];
  onChange: (v: string | string[]) => void;
  /** Allow several chips at once; value is then a string[]. */
  multi?: boolean;
}

/** Row of toggle chips for filtering a list. Single-select by default. */
export function FilterChips({ options, value, onChange, multi = false }: FilterChipsProps) {
  const selected = new Set(Array.isArray(value) ? value : [value]);

  function toggle(v: string) {
    if (!multi) {
      onChange(v);
      return;
    }
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next]);
  }

  return (
    <div role="group" className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors",
              on
                ? "border-ddg-orange bg-ddg-cream text-ddg-orange-dark"
                : "border-ddg-line bg-white text-ddg-ink hover:bg-ddg-soft",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cx("tabular text-xs", on ? "text-ddg-orange-dark/80" : "text-ddg-muted")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
