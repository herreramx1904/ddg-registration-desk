import type { ReactNode } from "react";
import { cx } from "./cx";

export interface KpiProps {
  label: string;
  value: number | string;
  /** Shows "value / total". */
  total?: number;
  hint?: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "vip" | "access";
  onClick?: () => void;
}

const tones: Record<NonNullable<KpiProps["tone"]>, string> = {
  neutral: "text-ddg-ink",
  ok: "text-ok-strong",
  warn: "text-warn-strong",
  danger: "text-danger-strong",
  vip: "text-vip-strong",
  access: "text-access-strong",
};

/** One compact number with a label. Use inside <KpiRow>. */
export function Kpi({ label, value, total, hint, tone = "neutral", onClick }: KpiProps) {
  const body = (
    <>
      <p className="text-xs text-ddg-muted">{label}</p>
      <p className={cx("tabular mt-0.5 text-2xl leading-tight", tones[tone])}>
        {value}
        {total !== undefined && <span className="text-sm text-ddg-muted"> / {total}</span>}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-ddg-muted">{hint}</p>}
    </>
  );
  const base = "min-w-0 px-4 py-3 text-left";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(base, "w-full rounded-lg hover:bg-ddg-soft")}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

/** Responsive strip of KPIs with hairline dividers. One panel, no cards-in-cards. */
export function KpiRow({ children }: { children: ReactNode }) {
  return (
    <div
      className={cx(
        "grid grid-cols-2 rounded-lg border border-ddg-line bg-white sm:grid-cols-3 lg:flex lg:flex-wrap",
        "[&>*]:border-ddg-line [&>*]:border-b [&>*:nth-child(odd)]:border-r sm:[&>*:nth-child(odd)]:border-r-0 sm:[&>*:not(:nth-child(3n))]:border-r",
        "lg:[&>*]:flex-1 lg:[&>*]:border-b-0 lg:[&>*:not(:last-child)]:border-r lg:[&>*:nth-child(3n)]:border-r",
        "lg:[&>*:last-child]:border-r-0",
      )}
    >
      {children}
    </div>
  );
}
