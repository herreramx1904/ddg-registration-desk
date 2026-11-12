// Pure field-level cleaning rules for the client's registration sheet.
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { GuestType, YesNoUnknown } from "@/lib/domain/types";

export function collapse(s: string | null | undefined): string {
  return (s ?? "").replace(/[\s ]+/g, " ").trim();
}

export function orNull(s: string): string | null {
  return s === "" ? null : s;
}

// ---------- Names ----------
const PARTICLES = new Set(["van", "den", "der", "de", "von", "da", "di", "du", "del", "dos", "das", "la", "le", "ter", "ten", "af"]);

function hasLetters(s: string): boolean {
  return /\p{L}/u.test(s);
}

/** ALL CAPS or all lowercase (and contains letters) → needs proper-casing. Mixed case is left as-is. */
export function needsCasing(s: string): boolean {
  if (!hasLetters(s)) return false;
  return s === s.toUpperCase() || s === s.toLowerCase();
}

function capFirst(w: string): string {
  if (!w) return w;
  const chars = Array.from(w);
  return chars[0].toUpperCase() + chars.slice(1).join("");
}

/** Proper-case a name: per-word first letter upper, rest lower; particles stay lower (not as first word of the full value);
 *  handles hyphens and apostrophes (O'Brien, Anne-Marie). */
export function properCase(s: string, isLastName = false): string {
  const words = s.toLowerCase().split(" ");
  return words
    .map((w, i) => {
      // particles stay lower unless they are the very first word of a first name
      if (PARTICLES.has(w) && (isLastName || i > 0) && i < words.length - 1) return w;
      return w
        .split("-")
        .map((part) => part.split(/(['’])/).map((p) => (p === "'" || p === "’" ? p : capFirst(p))).join(""))
        .join("-");
    })
    .join(" ");
}

/** Split "Anna van den Berg" → ["Anna", "van den Berg"]; "Jürgen Lie" → ["Jürgen", "Lie"]. */
export function splitFullName(full: string): [string, string] {
  const words = full.split(" ");
  if (words.length < 2) return [full, ""];
  // last name starts at the first particle after the first word, else at the last word
  let start = words.length - 1;
  for (let i = 1; i < words.length - 1; i++) {
    if (PARTICLES.has(words[i].toLowerCase())) {
      start = i;
      break;
    }
  }
  return [words.slice(0, start).join(" "), words.slice(start).join(" ")];
}

// ---------- Email ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;

export interface EmailResult {
  email: string | null;
  valid: boolean;
  fixed: boolean; // structural fix (" at ", trailing punctuation), not just lowercasing
}

export function cleanEmail(rawText: string | null): EmailResult {
  const trimmed = collapse(rawText);
  if (!trimmed) return { email: null, valid: false, fixed: false };
  let e = trimmed.toLowerCase();
  let fixed = false;
  const atFixed = e.replace(/\s*(?:\(at\)|\[at\]|\s+at\s+)\s*/, "@");
  if (atFixed !== e && !e.includes("@")) {
    e = atFixed;
    fixed = true;
  }
  const stripped = e.replace(/[,;.\s]+$/, "").replace(/^[<"'\s]+|[>"'\s]+$/g, "");
  if (stripped !== e) {
    e = stripped;
    fixed = true;
  }
  if (EMAIL_RE.test(e)) return { email: e, valid: true, fixed };
  return { email: trimmed, valid: false, fixed: false };
}

// ---------- Phone ----------
export function cleanPhone(rawText: string | null): { mobile: string | null; ok: boolean } {
  const t = collapse(rawText);
  if (!t) return { mobile: null, ok: false };
  const prepared = t.replace(/^00/, "+").replace(/^\+\s*/, "+");
  try {
    const p = parsePhoneNumberFromString(prepared, "NO");
    if (p && (p.isValid() || p.isPossible())) return { mobile: p.number, ok: true };
  } catch {
    // fall through
  }
  return { mobile: null, ok: false };
}

// ---------- Guest type ----------
const GUEST_TYPES: GuestType[] = ["Customer", "Partner", "VIP", "Internal", "Press", "Speaker"];
export function cleanGuestType(rawText: string | null): GuestType {
  const t = collapse(rawText).toLowerCase();
  return GUEST_TYPES.find((g) => g.toLowerCase() === t) ?? "Unknown";
}

// ---------- Breakout ----------
/** "A - OrbitBot for developers" → "A"; "Breakout B" → "B"; "C + B" → "B+C"; "B + B" → "B"; blank → null. */
export function cleanBreakout(rawText: string | null): string | null {
  const t = collapse(rawText);
  if (!t) return null;
  const letters = new Set<string>();
  for (const part of t.split(/\s*[+&,/]\s*|\s+and\s+/i)) {
    const m = part.replace(/^breakout\s*/i, "").trim().match(/^([A-Da-d])(?![\p{L}])/u);
    if (m) letters.add(m[1].toUpperCase());
  }
  if (letters.size === 0) return null;
  return [...letters].sort().join("+");
}

// ---------- Dietary ----------
export interface DietaryResult {
  dietary: string | null;
  assumedVeg: boolean;
  allergy: boolean;
}
export function cleanDietary(rawText: string | null): DietaryResult {
  const t = collapse(rawText);
  if (!t) return { dietary: null, assumedVeg: false, allergy: false };
  const l = t.toLowerCase().replace(/[!.]+$/g, "").trim();
  const allergy = l.includes("allerg");
  let d: string;
  let assumedVeg = false;
  if (l === "veg") {
    d = "Vegetarian";
    assumedVeg = true;
  } else if (l === "vegetarian" || l === "vegetarisk") d = "Vegetarian";
  else if (l === "vegan") d = "Vegan";
  else if (l === "pescatarian" || l === "pescetarian") d = "Pescatarian";
  else if (/nut/.test(l) && allergy) d = "Nut allergy";
  else if (l === "no pork") d = "No pork";
  else if (l === "halal") d = "Halal";
  else if (/gluten/.test(l)) d = "Gluten-free";
  else if (/lactose/.test(l)) d = "Lactose intolerant";
  else if (l === "none" || l === "no" || l === "n/a" || l === "-") d = "None";
  else d = capFirst(t.replace(/!+$/, ""));
  return { dietary: d, assumedVeg, allergy };
}

// ---------- Yes / no ----------
export function cleanYesNo(rawText: string | null): YesNoUnknown {
  const t = collapse(rawText).toLowerCase();
  if (!t) return "unknown";
  if (["yes", "y", "ja", "j", "true", "x"].includes(t)) return "yes";
  if (["no", "n", "nei", "false"].includes(t)) return "no";
  return "unknown";
}

export function cleanPlusOne(rawText: string | null): { plusOne: YesNoUnknown; name: string | null } {
  const t = collapse(rawText);
  if (!t) return { plusOne: "unknown", name: null };
  const yn = cleanYesNo(t);
  if (yn !== "unknown") return { plusOne: yn, name: null };
  if (/^(none|-|0)$/i.test(t)) return { plusOne: "no", name: null };
  const name = collapse(t.replace(/^\+\s*1\b/, "").replace(/[()]/g, " "));
  if (!name || /\b(tbc|tba|tbd|unknown|n\/a)\b/i.test(name) || !hasLetters(name)) return { plusOne: "yes", name: null };
  return { plusOne: "yes", name: needsCasing(name) ? properCase(name) : name };
}

// ---------- Dates ----------
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
};
const DEFAULT_YEAR = 2026;

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y.toString().padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isoFromDate(d: Date): string {
  // exceljs gives dates as UTC midnight; use UTC parts to avoid timezone off-by-one
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) as string;
}

export function ddmmyyyy(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function cleanDate(rawText: string | null): { iso: string | null; ambiguous: boolean } {
  const t = collapse(rawText);
  if (!t) return { iso: null, ambiguous: false };
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return { iso: iso(+m[1], +m[2], +m[3]), ambiguous: false };
  m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (m) {
    const d = +m[1];
    const mo = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return { iso: iso(y, mo, d), ambiguous: d <= 12 && mo <= 12 && d !== mo };
  }
  m = t.match(/^(\d{1,2})\.?\s+([A-Za-z]{3})[A-Za-z]*\.?(?:\s+(\d{4}))?$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return { iso: iso(m[3] ? +m[3] : DEFAULT_YEAR, MONTHS[m[2].toLowerCase()], +m[1]), ambiguous: false };
  }
  return { iso: null, ambiguous: false };
}

// ---------- Duplicate keys ----------
export function foldName(s: string): string {
  return collapse(s)
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/ß/g, "ss")
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
