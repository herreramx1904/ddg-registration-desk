import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Coloured left edge to signal status. */
  accent?: "orange" | "purple" | "ok" | "warn" | "danger" | "vip" | "access" | "none";
  padding?: "none" | "sm" | "md" | "lg";
  as?: "div" | "section" | "article";
}

const accents = {
  orange: "border-l-[6px] border-l-ddg-orange",
  purple: "border-l-[6px] border-l-ddg-purple",
  ok: "border-l-[6px] border-l-ok",
  warn: "border-l-[6px] border-l-warn",
  danger: "border-l-[6px] border-l-danger",
  vip: "border-l-[6px] border-l-vip",
  access: "border-l-[6px] border-l-access",
  none: "",
};
const paddings = { none: "", sm: "p-3", md: "p-4 sm:p-5", lg: "p-5 sm:p-7" };

export function Card({ accent = "none", padding = "md", as: Tag = "div", className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(
        "rounded-2xl border border-ddg-line bg-white shadow-ddg",
        accents[accent],
        paddings[padding],
        className,
      )}
      {...rest}
    />
  );
}
