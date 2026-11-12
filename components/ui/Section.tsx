import type { ReactNode } from "react";
import { cx } from "./cx";

export interface SectionProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right side of the header row, e.g. a small button or filter. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** White panel with a 1px border and a title row. No shadow. */
export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cx("rounded-lg border border-ddg-line bg-white", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-ddg-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ddg-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ddg-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
