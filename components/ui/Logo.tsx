import { cx } from "./cx";

export interface LogoProps {
  /** Small label under the wordmark. Default "Registration Desk". Pass null to hide. */
  label?: string | null;
  /** "dark" = ink text (on white), "light" = white text (on gradient/orange). */
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: { word: "text-xl", dot: "size-[0.3em]", label: "text-[9px]" },
  md: { word: "text-2xl", dot: "size-[0.3em]", label: "text-[10px]" },
  lg: { word: "text-5xl", dot: "size-[0.28em]", label: "text-xs" },
};

/** DDG wordmark: "DDG" + orange dot, with a small "Europe · Registration Desk" sub-label. */
export function Logo({ label = "Registration Desk", tone = "dark", size = "md", className }: LogoProps) {
  const s = sizes[size];
  return (
    <span className={cx("inline-flex flex-col leading-none select-none", className)} aria-label="DDG Europe">
      <span
        className={cx(
          "ddg-heading inline-flex items-end tracking-tight",
          s.word,
          tone === "light" ? "text-white" : "text-ddg-ink",
        )}
      >
        DDG
        <span
          aria-hidden
          className={cx(
            "ml-[0.08em] mb-[0.1em] inline-block rounded-full",
            s.dot,
            "bg-ddg-orange",
          )}
        />
      </span>
      {label !== null && (
        <span
          className={cx(
            "mt-1 uppercase tracking-[0.18em]",
            s.label,
            tone === "light" ? "text-white/85" : "text-ddg-muted",
          )}
        >
          Europe · {label}
        </span>
      )}
    </span>
  );
}
