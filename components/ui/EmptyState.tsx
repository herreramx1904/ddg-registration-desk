import type { ReactNode } from "react";
import { cx } from "./cx";

export interface EmptyStateProps {
  title: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, detail, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ddg-line px-6 py-10 text-center",
        className,
      )}
    >
      <div className="mb-3 grid size-14 place-items-center rounded-full bg-ddg-cream text-ddg-orange">
        {icon ?? <span className="size-3 rounded-full bg-ddg-orange" />}
      </div>
      <p className="ddg-heading text-lg">
        {title}
        <span className="text-ddg-orange">.</span>
      </p>
      {detail && <p className="mt-1 max-w-sm text-sm text-ddg-muted">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
