import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Thin coloured left edge for semantic status. "orange" / "purple" draw nothing (brand is not a status). */
  accent?: "orange" | "purple" | "ok" | "warn" | "danger" | "vip" | "access" | "none";
  padding?: "none" | "sm" | "md" | "lg";
  as?: "div" | "section" | "article";
}

const accents = {
  orange: "",
  purple: "",
  ok: "border-l-2 border-l-ok",
  warn: "border-l-2 border-l-warn",
  danger: "border-l-2 border-l-danger",
  vip: "border-l-2 border-l-vip",
  access: "border-l-2 border-l-access",
  none: "",
};
const paddings = { none: "", sm: "p-3", md: "p-4", lg: "p-4 sm:p-5" };

export function Card({ accent = "none", padding = "md", as: Tag = "div", className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx("rounded-lg border border-ddg-line bg-white", accents[accent], paddings[padding], className)}
      {...rest}
    />
  );
}
