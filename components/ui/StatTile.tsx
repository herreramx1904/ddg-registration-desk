import type { ReactNode } from "react";
import { cx } from "./cx";

export interface CounterProps {
  value: number;
  /** If given, shows "value / total" (and a progress bar in Counter). */
  total?: number;
  label: ReactNode;
  /** Colour of the bar. Default orange. */
  tone?: "orange" | "purple" | "ok" | "warn" | "danger" | "vip" | "access";
  size?: "sm" | "md" | "lg";
  /** Extra line under the label, e.g. "12 walk-ins pending". */
  hint?: ReactNode;
  /** Draw the progress bar when total is given. Default true (desk). StatTile sets false. */
  bar?: boolean;
  className?: string;
}

const barTone = {
  orange: "bg-ddg-orange",
  purple: "bg-ddg-purple",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  vip: "bg-vip",
  access: "bg-access",
};
const valueSize = { sm: "text-2xl", md: "text-3xl", lg: "text-5xl sm:text-6xl" };

/** Bare counter: big number "87 / 139" + label + thin progress bar (desk). No card chrome. */
export function Counter({ value, total, label, tone = "orange", size = "md", hint, bar = true, className }: CounterProps) {
  const pct = bar && total && total > 0 ? Math.min(100, Math.round((value / total) * 100)) : null;
  return (
    <div className={cx("min-w-0", className)}>
      <p className="text-xs text-ddg-muted">{label}</p>
      <p className={cx("tabular mt-0.5 leading-none text-ddg-ink", valueSize[size])} aria-live="polite">
        <span className={size === "lg" ? "ddg-heading" : undefined}>{value}</span>
        {total !== undefined && <span className="text-[0.5em] text-ddg-muted"> / {total}</span>}
      </p>
      {pct !== null && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ddg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={value}
        >
          <div className={cx("h-full rounded-full transition-[width] duration-500", barTone[tone])} style={{ width: `${pct}%` }} />
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-ddg-muted">{hint}</p>}
    </div>
  );
}

/** Compact counter inside a bordered tile, for stat grids. No progress bar. */
export function StatTile(props: CounterProps) {
  const { className, size = "sm", ...rest } = props;
  return (
    <div className={cx("rounded-lg border border-ddg-line bg-white px-4 py-3", className)}>
      <Counter {...rest} size={size} bar={false} />
    </div>
  );
}
