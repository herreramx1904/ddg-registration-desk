import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeVariant = "info" | "vip" | "access" | "ok" | "warn" | "danger" | "neutral" | "brand";

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  /** Solid (filled) instead of soft tint. */
  solid?: boolean;
  size?: "sm" | "md";
  icon?: ReactNode;
  className?: string;
  title?: string;
}

const soft: Record<BadgeVariant, string> = {
  info: "bg-ddg-purple-light/40 text-[#4a3aa8] ring-ddg-purple-light",
  vip: "bg-vip-soft text-vip-strong ring-vip/30",
  access: "bg-access-soft text-access-strong ring-access/30",
  ok: "bg-ok-soft text-ok-strong ring-ok/30",
  warn: "bg-warn-soft text-warn-strong ring-warn/30",
  danger: "bg-danger-soft text-danger-strong ring-danger/30",
  neutral: "bg-ddg-soft text-ddg-ink ring-ddg-line",
  brand: "bg-ddg-cream text-ddg-orange-dark ring-ddg-orange/30",
};
const solidStyles: Record<BadgeVariant, string> = {
  info: "bg-ddg-purple text-white ring-transparent",
  vip: "bg-vip text-white ring-transparent",
  access: "bg-access text-white ring-transparent",
  ok: "bg-ok text-white ring-transparent",
  warn: "bg-warn text-white ring-transparent",
  danger: "bg-danger text-white ring-transparent",
  neutral: "bg-ddg-ink text-white ring-transparent",
  brand: "bg-ddg-orange text-white ring-transparent",
};

/** Sentence-case status chip, 6px radius. sm = 12px text (manager), md = 14px (desk). */
export function Badge({ children, variant = "neutral", solid = false, size = "sm", icon, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md ring-1 ring-inset",
        size === "sm" ? "h-5 px-1.5 text-xs" : "h-7 px-2.5 text-sm",
        solid ? solidStyles[variant] : soft[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
