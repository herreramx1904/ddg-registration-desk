// Client-side guest search + small formatting helpers for the desk screen.
import type { DeskGuest, Flag } from "@/lib/domain/types";
import { fold } from "@/lib/service/checkin";

export interface IndexedGuest {
  g: DeskGuest;
  hay: string;
  words: string[];
  names: string[];
}

export function buildIndex(guests: DeskGuest[]): IndexedGuest[] {
  return guests.map((g) => {
    const names = fold(`${g.firstName} ${g.lastName}`).split(" ").filter(Boolean);
    const hay = fold(`${g.firstName} ${g.lastName} ${g.company ?? ""} ${g.regId}`);
    return { g, hay, words: hay.split(" "), names };
  });
}

/** Every query word must appear (accent/case-insensitive). Word-start and name matches rank first. */
export function searchGuests(index: IndexedGuest[], query: string, limit = 8): { results: DeskGuest[]; total: number } {
  const tokens = fold(query).split(" ").filter(Boolean);
  if (!tokens.length) return { results: [], total: 0 };
  const hits: { g: DeskGuest; score: number }[] = [];
  for (const e of index) {
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      if (!e.hay.includes(t)) { ok = false; break; }
      if (e.names.some((n) => n.startsWith(t))) score += 3;
      else if (e.words.some((w) => w.startsWith(t))) score += 2;
      else score += 1;
    }
    if (ok) hits.push({ g: e.g, score });
  }
  hits.sort((a, b) => b.score - a.score
    || a.g.lastName.localeCompare(b.g.lastName) || a.g.firstName.localeCompare(b.g.firstName));
  return { results: hits.slice(0, limit).map((h) => h.g), total: hits.length };
}

export function timeOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export const fullName = (g: DeskGuest) => `${g.firstName} ${g.lastName}`.trim();

export const vipFlag = (g: DeskGuest): Flag | undefined => g.flags.find((f) => f.kind === "vip");
export const accessFlags = (g: DeskGuest): Flag[] => g.flags.filter((f) => f.kind === "accessibility");

/** Small badges on the card: allergy, plus-one, possible substitute (dietary is for catering, not the desk). */
export const infoFlags = (g: DeskGuest): Flag[] =>
  g.flags.filter((f) => f.severity === "info" && (f.kind === "allergy" || f.kind === "plus_one" || f.kind === "possible_substitute"));

/** Desk note only when it adds something the flags do not already say. */
export function extraNote(g: DeskGuest): string | null {
  const n = g.deskNote?.trim();
  if (!n) return null;
  const fn = fold(n);
  const said = g.flags.some((f) => {
    const d = fold(f.detail ?? "");
    return fold(f.label) === fn || (!!d && (fn.includes(d) || d.includes(fn)));
  });
  return said ? null : n;
}
