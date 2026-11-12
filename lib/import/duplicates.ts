// Duplicate SUGGESTIONS (hints for a manager). Never merges anything.
import type { ImportedRegistration, ImportedSuggestion, SuggestionStrength } from "@/lib/domain/types";
import { collapse } from "./normalise";

const RANK: Record<SuggestionStrength, number> = { strong: 3, medium: 2, weak: 1 };

export function suggestDuplicates(
  regs: ImportedRegistration[],
  foldName: (s: string) => string,
): ImportedSuggestion[] {
  const keys = regs.map((r) => {
    const name = foldName(`${r.clean.firstName} ${r.clean.lastName}`);
    const emailValid = !!r.clean.email && !r.flags.some((f) => f.kind === "email_invalid");
    return {
      row: r.rowNumber,
      phone: r.clean.mobile,
      name: name || null,
      email: emailValid ? r.clean.email!.toLowerCase() : null,
      company: r.clean.company ? foldName(collapse(r.clean.company)) : null,
    };
  });

  const out: ImportedSuggestion[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      let best: { strength: SuggestionStrength; reason: string } | null = null;
      const consider = (strength: SuggestionStrength, reason: string) => {
        if (!best || RANK[strength] > RANK[best.strength]) best = { strength, reason };
      };
      const sameName = !!a.name && a.name === b.name;
      const sameEmail = !!a.email && a.email === b.email;
      const sameCompany = !!a.company && a.company === b.company;
      if (a.phone && a.phone === b.phone) consider("strong", `Same phone ${a.phone}`);
      if (sameName && sameEmail) consider("medium", "Same name and email");
      else if (sameName && sameCompany) consider("medium", "Same name and company");
      if (sameEmail) consider("weak", `Shared email ${a.email}`);
      if (sameName) consider("weak", "Same name, different company/phone");
      if (best) {
        const [rowA, rowB] = a.row < b.row ? [a.row, b.row] : [b.row, a.row];
        const chosen = best as { strength: SuggestionStrength; reason: string };
        out.push({ rowA, rowB, strength: chosen.strength, reason: chosen.reason });
      }
    }
  }
  return out.sort((x, y) => RANK[y.strength] - RANK[x.strength] || x.rowA - y.rowA || x.rowB - y.rowB);
}
