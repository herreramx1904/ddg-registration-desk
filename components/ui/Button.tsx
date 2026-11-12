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
  primary:
    "bg-ddg-orange text-white shadow-[0_8px_20px_-8px_rgb(251_119_48/0.7)] hover:bg-ddg-orange-mid active:bg-ddg-orange-dark",
  secondary:
    "bg-white text-ddg-ink border-2 border-ddg-line hover:border-ddg-orange hover:text-ddg-orange-dark active:bg-ddg-cream",
  success:
    "bg-ok text-white shadow-[0_10px_24px_-10px_rgb(22_163_74/0.8)] hover:bg-ok-strong active:bg-ok-strong",
  danger: "bg-danger text-white hover:bg-danger-strong active:bg-danger-strong",
  warn: "bg-warn text-white hover:bg-warn-strong active:bg-warn-strong",
  vip: "bg-vip text-white hover:bg-vip-strong active:bg-vip-strong",
  ghost: "bg-transparent text-ddg-ink hover:bg-ddg-soft active:bg-ddg-line",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-12 px-5 text-base rounded-xl gap-2",
  lg: "h-14 px-6 text-lg rounded-2xl gap-2",
  xl: "h-[72px] w-full px-6 text-2xl rounded-2xl gap-3 ddg-heading tracking-wide",
};

/** Class string for styling links as buttons: <Link className={buttonClasses("secondary")} /> */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", fullWidth = false): string {
  return cx(
    "inline-flex select-none items-center justify-center whitespace-nowrap font-sans transition-[background-color,border-color,color,transform,box-shadow] duration-150",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
    size !== "xl" && "uppercase tracking-wider",
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
