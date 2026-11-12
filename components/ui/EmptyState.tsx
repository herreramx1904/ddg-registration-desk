import type { ReactNode } from "react";
import { cx } from "./cx";

export interface EmptyStateProps {
  title: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  /** "sm" = one quiet line plus optional action (manager lists). Default "md" (desk). */
  size?: "sm" | "md";
  className?: string;
}

export function EmptyState({ title, detail, icon, action, size = "md", className }: EmptyStateProps) {
  if (size === "sm") {
    return (
      <div
        className={cx(
          "flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-lg border border-ddg-line bg-white px-4 py-4 text-center text-sm text-ddg-muted",
          className,
        )}
      >
        {icon && <span className="text-ddg-muted">{icon}</span>}
        <span>
          <span className="text-ddg-ink">{title}</span>
          {detail && <span> {detail}</span>}
        </span>
        {action}
      </div>
    );
  }
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center rounded-lg border border-ddg-line bg-white px-6 py-8 text-center",
        className,
      )}
    >
      <div className="mb-3 grid size-10 place-items-center rounded-full bg-ddg-cream text-ddg-orange">
        {icon ?? <span className="size-2.5 rounded-full bg-ddg-orange" />}
      </div>
      <p className="text-base font-semibold text-ddg-ink">{title}</p>
      {detail && <p className="mt-1 max-w-sm text-sm text-ddg-muted">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
