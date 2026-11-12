import { useId } from "react";
import { cx } from "./cx";
import { LOGO_ART } from "./logo-art";

/**
 * DDG Europe logo — built from the exact vector artwork in the DDG Europe Brand Book 2026 (p.13–15).
 *
 * Brand rules implemented here:
 *  - The logo is the "DDG" wordmark, optionally with the "EUROPE. EUROPE." aura ring. No extra marks (the orange
 *    full stop belongs to headings, never to the logo).
 *  - Colour: orange (#FB7730), the berry→orange gradient, or white. Nothing else. `tone="light"` = white version.
 *  - Clear space: "at least 5 cm" in print ≈ 0.65 × the cap height. The SVG reserves it, so nothing can sit closer.
 *  - Shapes are never redrawn or stretched; the artwork scales uniformly.
 */
export type LogoVariant =
  /** DDG wordmark with the EUROPE ring, no background ("Orange without background" / "White without background"). */
  | "aura"
  /** Main logo: orange gradient disc, white DDG, orange EUROPE ring ("Main – Orange with background"). */
  | "aura-disc"
  /** DDG wordmark only ("Without aura"). Orange on light backgrounds, white on dark. */
  | "wordmark"
  /** Compact DDG / EUROPE lockup, as used in the brand book's page footers (p.17): EUROPE is outline artwork too, not live text. */
  | "stacked";

export interface LogoProps {
  variant?: LogoVariant;
  /** "dark" = brand colours (for white/light backgrounds). "light" = the white version (for dark or coloured backgrounds). */
  tone?: "dark" | "light";
  /** Artwork height in px, or a preset per variant. */
  size?: "sm" | "md" | "lg" | "xl" | number;
  /** Reserve the brand clear space around the logo (default true). Only disable when the surrounding layout guarantees it. */
  clearSpace?: boolean;
  /** Optional caption rendered OUTSIDE the clear space. It is not part of the logo. */
  label?: string | null;
  className?: string;
}

const ORANGE = "#FB7730";
const BERRY = "#AB365A";
/** Clear space in artwork units (cap height ≈ 86 units → 0.65 × 86 ≈ 56). */
const CLEAR = 56;

const PRESETS: Record<LogoVariant, Record<"sm" | "md" | "lg" | "xl", number>> = {
  aura: { sm: 56, md: 80, lg: 120, xl: 180 },
  "aura-disc": { sm: 56, md: 80, lg: 120, xl: 180 },
  wordmark: { sm: 22, md: 30, lg: 48, xl: 80 },
  stacked: { sm: 34, md: 46, lg: 72, xl: 112 },
};

/** Content box per variant, in artwork units relative to the logo centre: [x, y, w, h]. */
function contentBox(variant: LogoVariant): [number, number, number, number] {
  const { word, ringBox } = LOGO_ART;
  if (variant === "aura" || variant === "aura-disc") {
    const r = Math.ceil(Math.max(-ringBox.x, -ringBox.y, ringBox.x + ringBox.w, ringBox.y + ringBox.h));
    return [-r, -r, 2 * r, 2 * r];
  }
  if (variant === "stacked") {
    // DDG over the letter-spaced EUROPE line, exactly as in the brand book's footer lockup (p.17).
    const { europeBox } = LOGO_ART;
    const x = Math.min(word.x, europeBox.x);
    const right = Math.max(word.x + word.w, europeBox.x + europeBox.w);
    return [x, word.y, right - x, europeBox.y + europeBox.h - word.y];
  }
  return [word.x, word.y, word.w, word.h];
}

export function Logo({ variant = "aura", tone = "dark", size = "md", clearSpace = true, label = null, className }: LogoProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const wordGradId = `ddg-word-${uid}`;
  const discGradId = `ddg-disc-${uid}`;

  const [bx, by, bw, bh] = contentBox(variant);
  const pad = clearSpace ? CLEAR : 0;
  const vb = `${bx - pad} ${by - pad} ${bw + 2 * pad} ${bh + 2 * pad}`;
  const artHeight = typeof size === "number" ? size : PRESETS[variant][size];
  const height = artHeight * ((bh + 2 * pad) / bh);
  const width = height * ((bw + 2 * pad) / (bh + 2 * pad));

  const white = tone === "light";
  const letterFill =
    white ? "#FFFFFF" : variant === "aura" ? `url(#${wordGradId})` : variant === "aura-disc" ? "#FFFFFF" : ORANGE;
  const ringFill = white ? "#FFFFFF" : ORANGE;
  const { word } = LOGO_ART;

  return (
    <span className={cx("inline-flex items-center gap-2 align-middle leading-none select-none", className)}>
      <svg
        role="img"
        aria-label="DDG Europe"
        viewBox={vb}
        width={width}
        height={height}
        style={{ display: "block", flexShrink: 0 }}
      >
        <defs>
          <linearGradient id={wordGradId} gradientUnits="userSpaceOnUse" x1={word.x} y1="0" x2={word.x + word.w} y2="0">
            <stop offset="0" stopColor={BERRY} />
            <stop offset="1" stopColor={ORANGE} />
          </linearGradient>
          <linearGradient id={discGradId} gradientUnits="userSpaceOnUse" x1="0" y1={-LOGO_ART.disc.r} x2="0" y2={LOGO_ART.disc.r}>
            <stop offset="0" stopColor="#F49560" />
            <stop offset="0.45" stopColor="#FB7730" />
            <stop offset="0.75" stopColor="#F46920" />
            <stop offset="1" stopColor="#F15401" />
          </linearGradient>
        </defs>
        {variant === "aura-disc" && <circle r={LOGO_ART.disc.r} fill={`url(#${discGradId})`} />}
        <g fill={letterFill}>
          {LOGO_ART.letters.map((l, i) => (
            <path key={i} d={l.d} transform={`translate(${l.tx},${l.ty})`} />
          ))}
        </g>
        {(variant === "aura" || variant === "aura-disc") && (
          <g fill={ringFill}>
            {LOGO_ART.ring.map((g, i) => (
              <path key={i} d={g.d} transform={`translate(${g.tx},${g.ty})`} />
            ))}
          </g>
        )}
        {variant === "stacked" && (
          <g fill={letterFill}>
            {LOGO_ART.europe.map((g, i) => (
              <path key={i} d={g.d} transform={`translate(${g.tx},${g.ty})`} />
            ))}
          </g>
        )}
      </svg>
      {label && (
        <span className={cx("text-[10px] uppercase tracking-[0.18em]", white ? "text-white/85" : "text-ddg-muted")}>
          {label}
        </span>
      )}
    </span>
  );
}
