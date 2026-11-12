"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cx } from "./cx";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** CSS width, e.g. "8rem" or "20%". */
  width?: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  /** Hide the column below this breakpoint. */
  hideBelow?: "sm" | "md" | "lg";
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Shown instead of the body when rows is empty. */
  empty?: ReactNode;
  sort?: { key: string; dir: "asc" | "desc" };
  onSortChange?: (s: { key: string; dir: "asc" | "desc" }) => void;
  /** 34px rows instead of 40px. */
  dense?: boolean;
  stickyHeader?: boolean;
  selectedKey?: string | null;
  className?: string;
}

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };
const aligns = { left: "text-left", right: "text-right", center: "text-center" };

function cellValue<T>(row: T, key: string): ReactNode {
  const v = (row as Record<string, unknown>)[key];
  if (v === null || v === undefined || typeof v === "boolean") return v ? "Yes" : v === false ? "No" : "";
  return String(v);
}

/** Dense data table. Rows hover, focus and (with onRowClick) act as buttons. */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  sort,
  onSortChange,
  dense = false,
  stickyHeader = false,
  selectedKey,
  className,
}: TableProps<T>) {
  const rowH = dense ? "h-[34px]" : "h-10";
  const px = dense ? "px-2" : "px-3";

  function toggleSort(c: Column<T>) {
    if (!c.sortable || !onSortChange) return;
    const dir = sort?.key === c.key && sort.dir === "asc" ? "desc" : "asc";
    onSortChange({ key: c.key, dir });
  }

  function onKey(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <div className={cx("w-full overflow-x-auto rounded-lg border border-ddg-line bg-white", className)}>
      <table className="w-full border-collapse text-sm text-ddg-ink">
        <thead className={cx(stickyHeader && "sticky top-0 z-10")}>
          <tr className="border-b border-ddg-line bg-ddg-soft">
            {columns.map((c) => {
              const sorted = sort?.key === c.key;
              const ariaSort = sorted ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={ariaSort}
                  className={cx(
                    "h-9 whitespace-nowrap text-xs font-semibold text-ddg-muted",
                    px,
                    aligns[c.align ?? "left"],
                    c.hideBelow && hide[c.hideBelow],
                  )}
                >
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c)}
                      className={cx(
                        "inline-flex items-center gap-1 rounded hover:text-ddg-ink",
                        sorted && "text-ddg-ink",
                      )}
                    >
                      {c.header}
                      <span aria-hidden className={cx("text-[10px]", !sorted && "opacity-40")}>
                        {sorted && sort?.dir === "desc" ? "▼" : "▲"}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-ddg-muted">
                {empty ?? "Nothing here yet."}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const k = rowKey(row);
              const selected = selectedKey != null && selectedKey === k;
              return (
                <tr
                  key={k}
                  role={onRowClick ? "button" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-selected={selected || undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => onKey(e, row) : undefined}
                  className={cx(
                    "border-b border-ddg-line last:border-b-0",
                    onRowClick && "cursor-pointer hover:bg-ddg-soft focus-visible:bg-ddg-soft focus-visible:outline-none",
                    selected && "bg-ddg-cream hover:bg-ddg-cream",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cx(
                        rowH,
                        px,
                        "align-middle",
                        aligns[c.align ?? "left"],
                        c.align === "right" && "tabular",
                        c.hideBelow && hide[c.hideBelow],
                      )}
                    >
                      {c.render ? c.render(row) : cellValue(row, c.key)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
