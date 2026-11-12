// Shared domain contract. Owned by the lead (T1). Agents: import from here, do not edit.
// Glossary:
//  - Registration: one row of the client's Excel. Never merged, never deleted.
//  - Person: who actually walks in. Each registration belongs to exactly one person.
//    On import every registration gets its own person; a manager-confirmed duplicate link
//    moves two registrations onto one person. Check-ins attach to the PERSON.
//  - Check-in: admission of a person. At most one ACTIVE (not undone) check-in per person (DB-enforced).
//  - Walk-in: someone not on the list, registered at the desk, pending until a manager decides.
//  - Alert: arrival alert (VIP/accessibility checked in) or help call ("Call manager").
//  - Duplicate suggestion: a hint that two registrations may be one person. Never acted on automatically.

export type Role = "desk" | "manager";

export type GuestType = "Customer" | "Partner" | "VIP" | "Internal" | "Press" | "Speaker" | "Unknown";

export type PersonStatus = "registered" | "cancelled" | "do_not_admit";

export type YesNoUnknown = "yes" | "no" | "unknown";

/**
 * severity:
 *  - "warning": shown as a big banner at the desk (VIP, accessibility)
 *  - "info": small badge at the desk (allergy, plus-one, possible substitute, dietary)
 *  - "data": data-quality note, MANAGER ONLY (invalid email, ambiguous date, generated id, ...)
 */
export type FlagSeverity = "warning" | "info" | "data";

export type FlagKind =
  | "vip"
  | "accessibility"
  | "allergy"
  | "dietary"
  | "plus_one"
  | "possible_substitute"
  | "cancelled_note"
  | "generated_id"
  | "email_missing"
  | "email_invalid"
  | "email_fixed"
  | "phone_missing"
  | "date_ambiguous"
  | "name_fixed"
  | "other";

export interface Flag {
  kind: FlagKind;
  severity: FlagSeverity;
  label: string; // short, human: "VIP", "Wheelchair user", "Nut allergy"
  detail?: string; // e.g. "Greet personally, ask Hege" / "Needs step-free route"
}

export interface CleanFields {
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  guestType: GuestType;
  breakout: string | null; // "A" | "B" | "C" | "D" | "A+C" ... letters sorted, deduped
  dietary: string | null; // canonical, e.g. "Vegetarian", "Nut allergy", "None"
  plusOne: YesNoUnknown;
  plusOneName: string | null;
  mobile: string | null; // E.164, e.g. "+4792183860"
  registeredOn: string | null; // ISO date "2026-10-02"
  accountManager: string | null;
  hotel: YesNoUnknown;
}

export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
  rule: string; // e.g. "name.last_first_swap", "phone.e164", "breakout.normalise"
}

export interface ImportedRegistration {
  rowNumber: number; // Excel row number (header = 1)
  regId: string; // client's Reg ID, or generated "SX-N001"...
  regIdGenerated: boolean;
  raw: Record<string, string | null>; // header -> original cell value as text, untouched
  clean: CleanFields;
  flags: Flag[];
  deskNote: string | null; // action text safe for desk (VIP instruction, accessibility need, substitute)
  managerNotes: string | null; // full original note; MANAGER ONLY
  initialStatus: PersonStatus; // "cancelled" when the note says cancelled, else "registered"
  changes: FieldChange[];
}

export type SuggestionStrength = "strong" | "medium" | "weak";

export interface ImportedSuggestion {
  rowA: number; // rowNumber of registration A (A < B)
  rowB: number;
  strength: SuggestionStrength;
  reason: string; // "Same phone +4793933741", "Same name and company", "Shared email office@..."
}

export interface ImportReport {
  rowsRead: number;
  registrations: number;
  generatedIds: number;
  suggestions: Record<SuggestionStrength, number>;
  flaggedForReview: number; // registrations with at least one "data" flag
  changesByRule: Record<string, number>;
  cancelled: number;
}

export interface ImportResult {
  registrations: ImportedRegistration[];
  suggestions: ImportedSuggestion[];
  report: ImportReport;
}

// ---------- What the DESK may see (enforced server-side; never phone/email/manager notes) ----------
export interface DeskGuest {
  registrationId: string;
  personId: string;
  regId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  guestType: GuestType;
  breakout: string | null;
  flags: Flag[]; // only "warning" and "info" severities
  deskNote: string | null;
  status: PersonStatus;
  checkedIn: null | { at: string; staff: string };
  linkedRegIds: string[]; // other registrations confirmed as the same person
}

export type CheckInResult =
  | { ok: true; checkInId: string; guest: DeskGuest }
  | { ok: false; reason: "already_checked_in"; at: string; staff: string; guest: DeskGuest }
  | { ok: false; reason: "needs_cancel_confirm"; guest: DeskGuest }
  | { ok: false; reason: "do_not_admit"; guest: DeskGuest }
  | { ok: false; reason: "not_found" };

export interface Session {
  role: Role;
  staff: string;
}
