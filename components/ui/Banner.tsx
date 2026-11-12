import type { ReactNode } from "react";
import { cx } from "./cx";
import { IconAccess, IconAlert, IconBlock, IconCheck, IconStar } from "./icons";

export type BannerVariant = "vip" | "access" | "warn" | "danger" | "ok";

export interface BannerProps {
  variant: BannerVariant;
  title: ReactNode;
  detail?: ReactNode;
  /** Right/bottom slot, e.g. <Button size="sm" variant="secondary">Call manager</Button> */
  action?: ReactNode;
  /** Override the default icon (pass null to hide). */
  icon?: ReactNode | null;
  className?: string;
}

const styles: Record<BannerVariant, string> = {
  vip: "bg-vip text-white",
  access: "bg-access text-white",
  warn: "bg-warn text-white",
  danger: "bg-danger text-white",
  ok: "bg-ok text-white",
};

const defaultIcons: Record<BannerVariant, ReactNode> = {
  vip: <IconStar size={26} />,
  access: <IconAccess size={26} />,
  warn: <IconAlert size={26} />,
  danger: <IconBlock size={26} />,
  ok: <IconCheck size={26} />,
};

/** Big, unmissable alert strip (VIP, accessibility, cancelled, do-not-admit, success). */
export function Banner({ variant, title, detail, action, icon, className }: BannerProps) {
  const shownIcon = icon === undefined ? defaultIcons[variant] : icon;
  return (
    <div
      role={variant === "danger" || variant === "warn" ? "alert" : "status"}
      className={cx(
        "animate-pop flex flex-col gap-3 rounded-2xl p-4 shadow-ddg sm:flex-row sm:items-center",
        styles[variant],
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {shownIcon && (
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-white/20">{shownIcon}</span>
        )}
        <div className="min-w-0">
          <p className="ddg-heading text-lg leading-tight">{title}</p>
          {detail && <p className="mt-1 text-base leading-snug text-white/95">{detail}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  );
}
