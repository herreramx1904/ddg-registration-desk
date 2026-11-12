import type { ReactNode } from "react";
import { cx } from "./cx";

export interface HeadingProps {
  children: ReactNode;
  /** Semantic level. Default h2. */
  as?: "h1" | "h2" | "h3" | "h4";
  size?: "sm" | "md" | "lg" | "xl" | "display";
  /** Orange full stop at the end (brand rule). Default true. */
  dot?: boolean;
  /** Dot colour override, e.g. "text-white" on orange backgrounds. */
  dotClassName?: string;
  className?: string;
  id?: string;
}

const sizes = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl sm:text-3xl",
  xl: "text-3xl sm:text-4xl",
  display: "text-[2.3rem] leading-[0.95] min-[400px]:text-[2.6rem] sm:text-6xl break-words",
};

/** Uppercase DDG heading ending in an orange full stop: REGISTRATION DESK. */
export function Heading({ children, as: Tag = "h2", size = "md", dot = true, dotClassName, className, id }: HeadingProps) {
  return (
    <Tag id={id} className={cx("ddg-heading", sizes[size], className)}>
      {children}
      {dot && <span className={cx("text-ddg-orange", dotClassName)}>.</span>}
    </Tag>
  );
}
