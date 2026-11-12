import { cx } from "./cx";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Accessible label. Default "Loading". */
  label?: string;
}

const sizes = { sm: "size-4 border-2", md: "size-6 border-[3px]", lg: "size-10 border-4" };

export function Spinner({ size = "md", className, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx(
        "inline-block animate-spin rounded-full border-current border-r-transparent align-[-0.125em]",
        sizes[size],
        className,
      )}
    />
  );
}
