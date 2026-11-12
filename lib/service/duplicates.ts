// Duplicate suggestions (T6). Managers decide; the app never merges by itself.
// Confirm = both registrations move onto ONE person (one admission for both tickets).
// Reject = they stay two people. Original rows (raw/clean) are never changed.
import type { GuestType, PersonStatus, Session, SuggestionStrength } from "@/lib/domain/types";
import type { CheckinRow, RegRow, Store, SuggestionRow } from "@/lib/server/store/types";

export interface DuplicateSide {
  registrationId: string;
  personId: string;
  regId: string;
  rowNumber: number;
  firstName: string;
  lastName: string;
  company: string | null;
  guestType: GuestType;
  email: string | null;
  mobile: string | null;
  raw: Record<string, string | null>;
  personStatus: PersonStatus;
  checkedIn: null | { at: string; staff: string };
}

export interface DuplicateView {
  id: string;
  strength: SuggestionStrength;
  reason: string;
  decision: SuggestionRow["decision"];
  decidedBy: string | null;
  decidedAt: string | null;
  /** Both registrations already belong to the same person (e.g. linked through another suggestion). */
  samePerson: boolean;
  a: DuplicateSide;
  b: DuplicateSide;
}

const strengthRank: Record<SuggestionStrength, number> = { strong: 0, medium: 1, weak: 2 };
const statusRank: Record<PersonStatus, number> = { registered: 0, cancelled: 1, do_not_admit: 2 };

/** The stricter of two statuses: do_not_admit > cancelled > registered. */
export function stricterStatus(a: PersonStatus, b: PersonStatus): PersonStatus {
  return statusRank[a] >= statusRank[b] ? a : b;
}

function side(r: RegRow, active: CheckinRow | null): DuplicateSide {
  return {
    registrationId: r.id, personId: r.personId, regId: r.regId, rowNumber: r.rowNumber,
    firstName: r.firstName, lastName: r.lastName, company: r.company, guestType: r.guestType,
    email: r.clean.email, mobile: r.clean.mobile, raw: r.raw, personStatus: r.personStatus,
    checkedIn: active ? { at: active.at, staff: active.staff } : null,
  };
}

/** MANAGER ONLY data (contains email, phone and raw rows). Pending first, then strong -> medium -> weak. */
export async function listSuggestions(store: Store): Promise<DuplicateView[]> {
  const [sugs, regs, active] = await Promise.all([
    store.listSuggestions(), store.listRegistrations(), store.listCheckins({ activeOnly: true }),
  ]);
  const regById = new Map(regs.map((r) => [r.id, r]));
  const activeByPerson = new Map(active.map((c) => [c.personId, c]));
  const out: DuplicateView[] = [];
  for (const s of sugs) {
    const ra = regById.get(s.registrationA), rb = regById.get(s.registrationB);
    if (!ra || !rb) continue;
    out.push({
      id: s.id, strength: s.strength, reason: s.reason, decision: s.decision, decidedBy: s.decidedBy, decidedAt: s.decidedAt,
      samePerson: ra.personId === rb.personId,
      a: side(ra, activeByPerson.get(ra.personId) ?? null),
      b: side(rb, activeByPerson.get(rb.personId) ?? null),
    });
  }
  return out.sort((x, y) => {
    const px = x.decision === "pending" ? 0 : 1, py = y.decision === "pending" ? 0 : 1;
    if (px !== py) return px - py;
    if (px === 1 && x.decidedAt !== y.decidedAt) return (y.decidedAt ?? "").localeCompare(x.decidedAt ?? ""); // newest decisions first
    if (strengthRank[x.strength] !== strengthRank[y.strength]) return strengthRank[x.strength] - strengthRank[y.strength];
    return x.a.rowNumber - y.a.rowNumber || x.b.rowNumber - y.b.rowNumber;
  });
}

export type DecideResult =
  | { ok: true; suggestion: SuggestionRow; message: string }
  | { ok: false; code: "forbidden" | "not_found" | "already_decided" | "both_checked_in"; message: string };

export async function decideSuggestion(
  store: Store, session: Session, id: string, decision: "confirmed" | "rejected",
): Promise<DecideResult> {
  if (session.role !== "manager") return { ok: false, code: "forbidden", message: "Managers only" };
  const s = await store.getSuggestion(id);
  if (!s) return { ok: false, code: "not_found", message: "Suggestion not found" };
  if (s.decision !== "pending") {
    return { ok: false, code: "already_decided", message: `Already ${s.decision} by ${s.decidedBy ?? "someone"}` };
  }
  const [ra, rb] = await Promise.all([store.getRegistration(s.registrationA), store.getRegistration(s.registrationB)]);
  if (!ra || !rb) return { ok: false, code: "not_found", message: "Registration not found" };
  const regIds = [ra.regId, rb.regId];

  if (decision === "rejected") {
    const updated = await store.decideSuggestion(id, "rejected", session.staff);
    if (!updated) return { ok: false, code: "not_found", message: "Suggestion not found" };
    await store.audit({
      staff: session.staff, role: session.role, action: "duplicate.reject", target: regIds.join(" + "),
      details: { suggestionId: id, regIds, strength: s.strength, reason: s.reason },
    });
    return { ok: true, suggestion: updated, message: "Kept as two different people" };
  }

  // --- confirm ---
  const details: Record<string, unknown> = { suggestionId: id, regIds, strength: s.strength, reason: s.reason };
  let message = "Linked: one admission for both tickets";
  if (ra.personId === rb.personId) {
    details.alreadyLinked = true;
    message = "Already the same person; marked as confirmed";
  } else {
    const [ca, cb] = await Promise.all([store.getActiveCheckin(ra.personId), store.getActiveCheckin(rb.personId)]);
    if (ca && cb) {
      return {
        ok: false, code: "both_checked_in",
        message: "Both registrations already checked in — they are probably two different people",
      };
    }
    // Keep the person that holds the active check-in (if any), so the check-in survives.
    const target = cb ? rb : ra;
    const other = target === ra ? rb : ra;
    const all = await store.listRegistrations();
    const moving = all.filter((r) => r.personId === other.personId).map((r) => r.id);
    await store.movePerson(moving, target.personId);
    details.targetPersonId = target.personId;
    details.keptCheckInOf = ca || cb ? target.regId : null;
    details.movedRegistrations = all.filter((r) => r.personId === other.personId).map((r) => r.regId);

    const strict = stricterStatus(ra.personStatus, rb.personStatus);
    if (ra.personStatus !== rb.personStatus) {
      details.status = { [ra.regId]: ra.personStatus, [rb.regId]: rb.personStatus, kept: strict };
      if (target.personStatus !== strict) await store.setPersonStatus(target.personId, strict);
      message += `; statuses differed, kept the stricter one (${strict.replace(/_/g, " ")})`;
    }
  }
  const updated = await store.decideSuggestion(id, "confirmed", session.staff);
  if (!updated) return { ok: false, code: "not_found", message: "Suggestion not found" };
  await store.audit({
    staff: session.staff, role: session.role, action: "duplicate.confirm", target: regIds.join(" + "), details,
  });
  return { ok: true, suggestion: updated, message };
}
