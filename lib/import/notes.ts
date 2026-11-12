// Classify the free-text Notes column. Full text always stays manager-only (managerNotes);
// only desk-safe action text (VIP instruction, accessibility need, possible substitute) reaches deskNote.
import type { Flag } from "@/lib/domain/types";
import { collapse } from "./normalise";

export interface NoteResult {
  flags: Flag[];
  deskNote: string | null;
  managerNotes: string | null;
  cancelled: boolean;
}

function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export function classifyNote(rawNote: string | null, isVipType: boolean): NoteResult {
  const note = collapse(rawNote);
  const flags: Flag[] = [];
  const desk: string[] = [];
  let cancelled = false;
  let vipFlag: Flag | null = null;

  // Segment on line breaks / semicolons so a mixed note doesn't leak commercial text into the desk view.
  const segments = note ? (rawNote ?? "").split(/[\n;]+/).map(collapse).filter(Boolean) : [];
  for (const seg of segments) {
    const l = seg.toLowerCase();
    if (/\bvip\b/i.test(seg)) {
      const instruction = sentenceCase(seg.replace(/\bvip\b[\s!.:,\-–—]*/i, "").replace(/^[\s!.:,\-–—]+/, ""));
      vipFlag = { kind: "vip", severity: "warning", label: "VIP", ...(instruction ? { detail: instruction } : {}) };
      if (instruction) desk.push(instruction);
      else desk.push("VIP");
    } else if (/wheelchair|step-?free|accessib|mobility|walking aid/.test(l)) {
      const wheelchair = l.includes("wheelchair");
      const detail = /step-?free/.test(l) ? "Needs step-free route" : sentenceCase(seg);
      const label = wheelchair ? "Wheelchair user" : "Accessibility need";
      flags.push({ kind: "accessibility", severity: "warning", label, detail });
      desk.push(`${label} – ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`);
    } else if (/cancel/.test(l)) {
      cancelled = true;
      flags.push({ kind: "cancelled_note", severity: "data", label: "Cancelled (per note)", detail: seg });
    } else if (/send (a )?colleague|\binstead\b|substitut|replacement/.test(l)) {
      flags.push({ kind: "possible_substitute", severity: "info", label: "May send a colleague" });
      desk.push("May send a colleague");
    }
    // anything else (commercial / internal remarks): managerNotes only.
  }

  if (!vipFlag && isVipType) vipFlag = { kind: "vip", severity: "warning", label: "VIP" };
  if (vipFlag) flags.unshift(vipFlag);

  return {
    flags,
    deskNote: desk.length ? desk.join(" · ") : null,
    managerNotes: note || null,
    cancelled,
  };
}
