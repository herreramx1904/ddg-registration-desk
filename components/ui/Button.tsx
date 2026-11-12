import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "warn" | "vip" | "ghost";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Stretch to container width (xl is always full width). */
  fullWidth?: boolean;
  /** Optional leading icon (inline SVG / text). */
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ddg-orange text-white shadow-[0_1px_2px_rgb(241_84_1/0.25)] hover:bg-ddg-orange-mid active:bg-ddg-orange-dark",
  secondary: "bg-white text-ddg-ink border border-ddg-line hover:border-ddg-orange hover:text-ddg-orange-dark active:bg-ddg-cream",
  success: "bg-ok text-white hover:bg-ok-strong active:bg-ok-strong",
  danger: "bg-danger text-white hover:bg-danger-strong active:bg-danger-strong",
  warn: "bg-warn text-white hover:bg-warn-strong active:bg-warn-strong",
  vip: "bg-vip text-white hover:bg-vip-strong active:bg-vip-strong",
  ghost: "bg-transparent text-ddg-ink hover:bg-ddg-soft active:bg-ddg-line",
};

/** Heights: sm 32, md 36, lg 40, xl 72 (the desk CHECK IN button). */
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm rounded-lg gap-1.5",
  md: "h-9 px-4 text-sm rounded-lg gap-2",
  lg: "h-10 px-5 text-base rounded-lg gap-2",
  xl: "h-[72px] w-full px-6 text-2xl rounded-lg gap-3 ddg-heading tracking-wide",
};

/** Class string for styling links as buttons: <Link className={buttonClasses("secondary")} /> */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", fullWidth = false): string {
  return cx(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-sans transition-[background-color,border-color,color] duration-150",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  icon,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses(variant, size, fullWidth), className)}
      {...rest}
    >
      {loading ? <Spinner size={size === "xl" ? "md" : "sm"} label="Working" /> : icon}
      {children}
    </button>
  );
}
