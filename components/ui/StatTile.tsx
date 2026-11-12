import type { ReactNode } from "react";
import { cx } from "./cx";

export interface CounterProps {
  value: number;
  /** If given, shows "value / total" and a progress bar. */
  total?: number;
  label: ReactNode;
  /** Colour of the bar / value. Default orange. */
  tone?: "orange" | "purple" | "ok" | "warn" | "danger" | "vip" | "access";
  size?: "sm" | "md" | "lg";
  /** Extra line under the label, e.g. "12 walk-ins pending". */
  hint?: ReactNode;
  className?: string;
}

const bar = {
  orange: "bg-ddg-orange",
  purple: "bg-ddg-purple",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  vip: "bg-vip",
  access: "bg-access",
};
const valueSize = { sm: "text-2xl", md: "text-4xl", lg: "text-5xl sm:text-6xl" };

/** Bare counter: big number "87 / 139" + label + thin progress bar. No card chrome. */
export function Counter({ value, total, label, tone = "orange", size = "md", hint, className }: CounterProps) {
  const pct = total && total > 0 ? Math.min(100, Math.round((value / total) * 100)) : null;
  return (
    <div className={cx("min-w-0", className)}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-ddg-muted">{label}</p>
      <p className={cx("tabular mt-1 leading-none text-ddg-ink", valueSize[size])} aria-live="polite">
        <span className="ddg-heading">{value}</span>
        {total !== undefined && <span className="text-[0.55em] text-ddg-muted"> / {total}</span>}
      </p>
      {pct !== null && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ddg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={value}
        >
          <div className={cx("h-full rounded-full transition-[width] duration-500", bar[tone])} style={{ width: `${pct}%` }} />
        </div>
      )}
      {hint && <p className="mt-1.5 text-xs text-ddg-muted">{hint}</p>}
    </div>
  );
}

/** Counter inside a card tile, for stat grids. */
export function StatTile(props: CounterProps) {
  const { className, ...rest } = props;
  return (
    <div className={cx("rounded-2xl border border-ddg-line bg-white p-4 shadow-ddg", className)}>
      <Counter {...rest} />
    </div>
  );
}
